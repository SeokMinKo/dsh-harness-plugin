"""Run the pinned upstream Desktop Host and Desktop CLI in disposable Node-mode profiles."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from urllib.error import HTTPError

from playwright.sync_api import sync_playwright

from browser_cases import dismiss_preview_notice
from harness import CORE_VERSION, Host, ROOT, Rpc, RpcError, TEAM, bounded_wait, redacted, uid

DESKTOP_COMMIT = '66491b05'


class DesktopHost(Host):
    def __init__(self, workdir, runtime, source, pnpm):
        super().__init__(workdir, runtime)
        commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
        if not commit.startswith(DESKTOP_COMMIT):
            raise RuntimeError('Desktop source must be dsh-v0.2.2-rc.1 (' + DESKTOP_COMMIT + ').')
        self.code = workdir / 'desktop-source'
        shutil.copytree(source / 'apps' / 'desktop-host' / 'src', self.code)
        (self.code / 'node_modules').symlink_to(runtime / 'node_modules', target_is_directory=True)
        for name in ['desktop-cli-runner.mjs', 'desktop-host-runner.mjs']:
            shutil.copy2(ROOT / name, self.code / name)
        support = workdir / 'desktop-support'
        payload = support / 'primary-runtime' / 'dependencies'
        payload.mkdir(parents=True)
        (payload / 'pnpm').symlink_to(pnpm, target_is_directory=True)
        (support / 'office-skills').symlink_to(runtime / 'node_modules' / '@deepseek-ai' / 'dsh-skill-office' / 'assets',
            target_is_directory=True)
        self.env.update(TEAM_CHAT_DESKTOP_SUPPORT=str(support), DSH_CLIENT_VERSION=CORE_VERSION)
        self.profile = self.home / 'profiles' / 'desktop'
        self.fixture = False
        self.management('init')
        self.patch = self.profile / 'cordis.patch.yml'
        self.patch.write_text('- id: desktop-product-telemetry\n  disabled: true\n- id: product-analytics\n  disabled: true\n')

    def management(self, *args):
        result = subprocess.run(['node', str(self.code / 'desktop-cli-runner.mjs'), *map(str, args)], cwd=self.cwd,
            env=self.env, capture_output=True, text=True, timeout=90)
        if result.returncode:
            raise RuntimeError(redacted((result.stdout + '\n' + result.stderr)[-3500:]))
        return result.stdout

    def plugin(self, *args):
        return self.management('plugin', '--profile', 'desktop', *args)

    def enable_team(self):
        self.fixture = True
        shutil.copy2(ROOT / 'fixture.mjs', self.profile / 'fixture.mjs')
        with self.patch.open('a', encoding='utf-8') as config:
            config.write(self.team_patch.read_text() + '\n' + self.fixture_patch.read_text())

    def start(self):
        assert self.process is None
        self.generation += 1
        self.log = self.workdir / f'host-{self.generation}.log'
        with self.log.open('wb') as log:
            self.process = subprocess.Popen(['node', str(self.code / 'desktop-host-runner.mjs')],
                cwd=self.cwd, env=self.env, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT)
        try:
            return bounded_wait(self.ready_url, 'Desktop Host IPC ready', seconds=50)
        except Exception as error:
            raise RuntimeError(redacted(self.logs()[-3500:])) from error

    def ready_url(self):
        log = self.logs()
        match = re.search(r'DESKTOP_HOST_READY\ndsh web: (http://[^\s]+)', log)
        if match and (not self.fixture or 'TEAM_CHAT_FIXTURE_READY' in log):
            return match[1]
        if self.process.poll() is not None:
            raise RuntimeError('Desktop Host exited during startup.')
        return None

    def control(self, operation, **extra):
        request_id = len(self.logs())
        message = {'type': operation, 'requestId': request_id, **extra}
        self.process.stdin.write(json.dumps(message).encode() + b'\n')
        self.process.stdin.flush()
        def response():
            for line in self.logs().splitlines():
                if line.startswith('DESKTOP_CONTROL '):
                    value = json.loads(line.partition(' ')[2])
                    if value['requestId'] == request_id:
                        return value
            return None
        return bounded_wait(response, 'Desktop Host IPC ' + operation)


def run_desktop(host, archive, record, chromium):
    rpc = None

    def fresh_profile():
        nonlocal rpc
        host.install(archive)
        assert 'dsh-team-chat' in host.plugin('list')
        assert not (host.home / 'profiles' / 'web').exists()
        url = host.start()
        rpc = Rpc(url)
        assert rpc.room('list') == {'available': False, 'rooms': [], 'teams': []}
        try:
            Rpc(url, authenticate=False).room('list')
        except HTTPError as error:
            assert error.code == 401
        else:
            raise AssertionError('unauthenticated owner RPC was accepted')
        host.stop()
        assert 'DESKTOP_IPC_SHUTDOWN' in host.logs()
        return {'desktopHost': DESKTOP_COMMIT, 'profile': 'desktop', 'AgentTeamsByDefault': False}

    def native_team():
        nonlocal rpc
        host.enable_team()
        rpc = Rpc(host.start())
        assert rpc.room('list')['available']
        rpc.save_room(title='Desktop Team Chat')
        identifier = rpc.send('@lead 로그를 팀원들이 나눠 분석해줘')
        def proposal():
            item = next((m.get('assignment') for m in rpc.view()['messages'] if m['id'] == identifier), None)
            return item if item and item['status'] == 'review' else None
        draft = bounded_wait(proposal, 'Desktop allocation proposal')
        assert not wf()['native']
        wf('approveAllocation', id=identifier, revision=draft['revision'], input='', device='',
            assignments=[{'nodeId': node['id'], 'agent': node['agent']} for node in draft['draft']['nodes']])
        run = wait_run(identifier, lambda value: value['status'] == 'complete', 'Desktop allocation complete')
        assert len({step['native'] for step in run['steps'].values()}) == 3
        return {'sameNativeAgents': len(wf()['members']), 'originalBoardTasks': len(wf()['native'])}

    def wf(action='view', **fields):
        return rpc.room('workflow', teamId=TEAM, input={'action': action, **fields})

    def wait_run(identifier, predicate, label):
        return bounded_wait(lambda: next((run for run in wf()['runs'] if run['id'] == identifier and predicate(run)), None), label)

    def save(instruction, tools=False, device=False):
        current = wf()
        lead = next(agent for agent in current['members'] if agent['name'] == 'lead')
        draft = {'title': 'Desktop test', 'layout': 'sequence', 'groups': [], 'nodes': [{
            'id': 'probe', 'title': 'Desktop probe', 'agent': lead['id'], 'group': None,
            'instruction': instruction, 'completion': '', 'needsDevice': device, 'tools': tools, 'outputs': [], 'after': [],
        }]}
        revision = wf('draft', revision=current['revision'], draft=draft)['revision']
        return wf('publish', revision=revision)['version']

    def controls_and_files():
        version = save('wf-native-boundary', tools=True)
        identifier = uid()
        wf('start', id=identifier, input='', device='', tools=True, version=version)
        result = wait_run(identifier, lambda item: item['status'] == 'complete', 'scoped tool guard')
        assert 'workflow' in result['steps']['probe']['summary'], result['steps']['probe']
        assert not any(task['subject'] == 'isolated scope test' for task in wf()['native'])
        (host.cwd / 'sample').mkdir()
        (host.cwd / 'sample' / 'test.bin').write_bytes(b'test bytes')
        (host.cwd / 'link').symlink_to(host.workdir, target_is_directory=True)
        outside = host.workdir / 'outside.bin'
        outside.write_bytes(b'outside workspace')
        version = save('wf-input')
        for path in ['C:test.bin', 'sample/test.bin:stream', 'sample/NUL', 'link/outside.bin']:
            try:
                wf('start', id=uid(), input=path, device='', tools=False, version=version)
            except RpcError as error:
                assert '경로' in str(error) or '심볼릭' in str(error)
            else:
                raise AssertionError('unsafe path was accepted: ' + path)
        identifier = uid()
        wf('start', id=identifier, input='sample\\test.bin', device='', tools=False, version=version)
        assert wait_run(identifier, lambda item: item['status'] == 'complete', 'portable relative path')['inputHash']
        return {'deniedPaths': 4, 'portablePath': True, 'delegatedTaskCreated': False}

    def desktop_ipc():
        nonlocal rpc
        version = save('wf-crash', device=True)
        identifier = uid()
        wf('start', id=identifier, input='', device='virtual-desktop', tools=False, version=version)
        bounded_wait(lambda: 'WF_CRASH_START' in host.logs(), 'Desktop active Agent')
        assert host.control('quit-inspection')['activeTasks'] is True
        assert host.control('update-tasks', action='lock')['active'] is True
        try:
            wf('start', id=uid(), input='', device='virtual-desktop', tools=False, version=version)
        except HTTPError as error:
            assert error.code == 503, error
        else:
            raise AssertionError('Desktop update admission did not block owner RPC')
        assert host.control('update-tasks', action='unlock')['active'] is True
        host.stop()
        assert 'DESKTOP_IPC_SHUTDOWN' in host.logs()
        rpc = Rpc(host.start())
        recovered = wait_run(identifier, lambda item: item['steps']['probe']['status'] == 'interrupted', 'Desktop IPC restart')
        assert recovered['steps']['probe']['attempt'] == 1
        assert 'WF_CRASH_START' not in host.logs()
        return {'quitDetectedActiveTurn': True, 'updateLockedOwnerRequests': True, 'replayed': False}

    def renderer():
        host.stop()
        url = host.start()
        with sync_playwright() as playwright:
            args = ['--disable-dev-shm-usage', '--no-proxy-server']
            if os.environ.get('TEAM_CHAT_CHROMIUM_SINGLE_PROCESS') == '1':
                args += ['--single-process', '--no-zygote', '--disable-gpu', '--no-sandbox']
            browser = playwright.chromium.launch(executable_path=chromium, headless=True, args=args)
            page = browser.new_page(viewport={'width': 1440, 'height': 920})
            page.set_default_timeout(14_000)
            dismiss_preview_notice(page)
            page.goto(url, wait_until='domcontentloaded')
            page.get_by_role('button', name='Team Chat', exact=True).click(timeout=25_000)
            page.get_by_role('heading', name='Desktop Team Chat').wait_for()
            page.get_by_role('textbox', name='메시지', exact=True).fill('@lead 데스크톱 창에서도 이 로그를 팀원들이 나눠 분석해줘')
            page.get_by_role('button', name='보내기', exact=True).click()
            page.get_by_role('form', name='리드 배분안').get_by_role('button', name='배분안 전체 승인').click()
            results = page.get_by_role('region', name='Agent별 실행 결과').last
            results.get_by_text('결과 취합 완료', exact=True).wait_for()
            results.locator('.tc-wf-status[data-state=complete]').nth(3).wait_for()
            results.scroll_into_view_if_needed()
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            page.screenshot(path=str(host.workdir / 'desktop-host-renderer.png'))
            version = browser.version
            browser.close()
        return {'desktopHost': DESKTOP_COMMIT, 'renderer': 'Chromium ' + version, 'electronShell': False, 'completedTasks': 3}

    for number, test in enumerate([fresh_profile, native_team, controls_and_files, desktop_ipc, renderer], 1):
        if not record(f'DT-{number:02}', test):
            break
