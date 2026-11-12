"""Disposable real DSH hosts and a small client for the native RPC carrier."""

import http.cookiejar
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.request
from uuid import uuid4

ROOT = Path(__file__).resolve().parent
CORE_VERSION = '0.2.2-rc.1'
TEAM = '4ef3f882-2688-4e7d-8bc0-10a98c0b1fc6'
TERMINAL = {'complete', 'partial', 'failed', 'stopped', 'interrupted'}


def uid():
    return str(uuid4())


def bounded_wait(predicate, label, seconds=16):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(.075)
    raise AssertionError('시간 내 관측 실패 · ' + label)


def redacted(value):
    return re.sub(r'token=[^\s\x27\x22<>]+', 'token=[redacted]', value)


def resolve_runtime(runtime, workdir):
    if runtime is None:
        runtime = workdir / 'runtime'
        runtime.mkdir()
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if not npm:
            raise RuntimeError('npm을 찾을 수 없습니다.')
        command = [npm, 'install', '--prefix', str(runtime), '--no-audit', '--no-fund', '@deepseek-ai/dsh@' + CORE_VERSION]
        subprocess.run(command, check=True, timeout=240)
    runtime = runtime.resolve()
    package = runtime / 'node_modules' / '@deepseek-ai' / 'dsh'
    installed = json.loads((package / 'package.json').read_text(encoding='utf-8'))['version']
    if installed != CORE_VERSION:
        raise RuntimeError('대상 DSH 코어 버전이 다릅니다. 설치 버전 ' + installed)
    return runtime


class RpcError(Exception):
    pass


class Rpc:
    def __init__(self, url, authenticate=True):
        self.base = url.split('?', 1)[0]
        self.transport = urllib.request.build_opener(urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        if authenticate:
            with self.transport.open(url, timeout=8) as result:
                assert result.status == 200
                assert 'dsh-team-chat/client.js' in result.read().decode()

    def call(self, method, args):
        body = {'type': 'client-request', 'rpcId': uid(), 'method': method, 'payload': {'args': args}}
        request = urllib.request.Request(self.base + 'api/' + method, json.dumps(body).encode(),
            {'content-type': 'application/json'})
        with self.transport.open(request, timeout=8) as response:
            result = json.load(response)['result']
        if not result['ok']:
            raise RpcError(result['error']['message'])
        return result['value']

    def room(self, op, **fields):
        return self.call('teamChat/request', {'input': {'op': op, **fields}})

    def view(self):
        return self.room('view', teamId=TEAM)

    def send(self, text, *, tools=False, id=None, reply_to=None):
        id = id or uid()
        request = dict(teamId=TEAM, id=id, text=text, tools=tools)
        if reply_to is not None:
            request['replyTo'] = reply_to
        assert self.room('send', **request)['accepted']
        return id

    def wait(self, predicate, label):
        def check():
            view = self.view()
            return view if predicate(view) else None
        return bounded_wait(check, label)

    def settled(self, id):
        view = self.wait(lambda row: not row['active'] and any(m['id'] == id and m['status'] in TERMINAL
            for m in row['messages']), '요청 종결 ' + id)
        start = next(i for i, message in enumerate(view['messages']) if message['id'] == id)
        return view['messages'][start:]

    def save_room(self, title='Team Chat E2E', rounds=3):
        roster = next(team for team in self.room('list')['teams'] if team['teamId'] == TEAM)
        return self.room('save', teamId=TEAM, title=title, members=[m['id'] for m in roster['members']], rounds=rounds)

    def steer(self, text):
        return self.call('session/prompt', {'request': {'sessionId': TEAM, 'requestId': uid(), 'mode': 'steer',
            'content': [{'type': 'text', 'text': text}]}})


class Host:
    def __init__(self, workdir, runtime):
        self.workdir = workdir
        self.home = workdir / 'dsh-home'
        self.home.mkdir(parents=True)
        self.cwd = workdir / 'project'
        self.cwd.mkdir()
        self.runtime = runtime
        self.env = dict(os.environ, DSH_HOME=str(self.home), TEAM_CHAT_E2E_RUNTIME=str(runtime))
        for key in list(self.env):
            if key.startswith(('DEEPSEEK_', 'ANTHROPIC_', 'OPENAI_', 'GROK_')):
                self.env.pop(key)
        self.cli = runtime / 'node_modules' / '@deepseek-ai' / 'dsh' / 'lib' / 'bin.js'
        self.team_patch = runtime / 'node_modules' / '@deepseek-ai' / 'dsh-experimental-agent-team-profile' / 'cordis.patch.yml'
        self.fixture_patch = workdir / 'fixture.patch.yml'
        self.fixture_patch.write_text("- insert:\n    - id: team-chat-e2e-fixture\n      name: './fixture.mjs'\n", encoding='utf-8')
        shutil.copy2(ROOT / 'fixture.mjs', workdir / 'fixture.mjs')
        self.process = None
        self.generation = 0
        self.log = None

    def plugin(self, *args):
        out = subprocess.run(['node', str(self.cli), 'plugin', '--profile', 'web', *map(str, args)],
            cwd=self.cwd, env=self.env, capture_output=True, encoding='utf-8', errors='replace', timeout=90)
        if out.returncode:
            raise RuntimeError(redacted((out.stdout + '\n' + out.stderr)[-3500:]))

    def install(self, archive):
        self.plugin('add', archive)

    def remove(self):
        self.plugin('remove', 'dsh-team-chat')

    def start(self):
        assert self.process is None
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as binding:
            binding.bind(('127.0.0.1', 0))
            port = binding.getsockname()[1]
        self.generation += 1
        self.log = self.workdir / f'host-{self.generation}.log'
        cmd = ['node', str(self.cli), '--profile', 'web', '--patch', str(self.team_patch),
            '--patch', str(self.fixture_patch), '--no-open', '--port', str(port)]
        with self.log.open('wb') as log:
            self.process = subprocess.Popen(cmd, cwd=self.cwd, env=self.env, stdout=log, stderr=subprocess.STDOUT)
        try:
            return bounded_wait(self.ready_url, 'DSH 호스트 시작', seconds=60)
        except Exception as error:
            raise RuntimeError(redacted(self.logs()[-3500:])) from error

    def logs(self):
        return self.log.read_text(encoding='utf-8', errors='replace') if self.log else ''

    def ready_url(self):
        log = self.logs()
        match = re.search(r'dsh web: (http://[^\s]+)', log)
        if match and 'TEAM_CHAT_FIXTURE_READY' in log:
            return match[1]
        if self.process.poll() is not None:
            raise RuntimeError('DSH가 시작 중 종료됐습니다.')
        return None

    def stop(self, *, hard=False):
        if self.process is None:
            return
        if self.process.poll() is None:
            if hard:
                self.process.kill()
            else:
                self.process.terminate()
            try:
                self.process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=8)
        self.process = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.stop()
