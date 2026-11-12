"""Interview requirements on the real Agent Team and Chromium."""

import os

from playwright.sync_api import sync_playwright

from browser_cases import dismiss_preview_notice
from harness import Rpc, RpcError, TEAM, bounded_wait, uid


def run_allocation_host(host, archive, record):
    host.install(archive)
    rpc = Rpc(host.start())
    rpc.save_room()

    def workflow(action='view', **data):
        return rpc.room('workflow', teamId=TEAM, input={'action': action, **data})

    def assignment(identifier):
        item = next((m for m in rpc.view()['messages'] if m['id'] == identifier), {})
        return item.get('assignment')

    def wait_plan(identifier, status):
        def ready():
            value = assignment(identifier)
            if value and value['status'] == 'failed' and status != 'failed':
                raise AssertionError(value.get('detail', '배분안 작성 실패'))
            return value if value and value['status'] == status else None
        return bounded_wait(ready, '배분안 ' + status)

    def plan(text='@lead 이 로그를 팀원들이 나눠 분석해줘'):
        identifier = rpc.send(text)
        return identifier, wait_plan(identifier, 'review')

    def approve(identifier, proposal, assignments=None):
        payload = [{'nodeId': node['id'], 'agent': node['agent']} for node in proposal['draft']['nodes']]
        return workflow('approveAllocation', id=identifier, revision=proposal['revision'],
            assignments=payload if assignments is None else assignments, input='', device='')

    def wait_run(identifier, when, label):
        def ready():
            item = next((item for item in workflow()['runs'] if item['id'] == identifier), None)
            return item if item and when(item) else None
        return bounded_wait(ready, label, seconds=23)

    def reject(function, reason):
        try:
            function()
        except RpcError as error:
            assert reason in str(error), str(error)
        else:
            raise AssertionError('잘못된 요청이 수락됐습니다.')

    def new_control():
        (host.cwd / 'resume-probe').unlink(missing_ok=True)
        identifier, proposal = plan('@lead 중지 시험을 팀원들이 나눠 진행해줘')
        approve(identifier, proposal)
        run = wait_run(identifier, lambda r: r['steps']['probe']['status'] == 'running'
            and r['steps']['probe'].get('hasCheckpoint') and r['steps']['independent']['status'] == 'complete',
            '체크포인트 이후 실행 및 독립 작업')
        return identifier, run

    def stop_probe(identifier, run):
        token = run['steps']['probe']['token']
        assert workflow('stopTask', id=identifier, nodeId='probe', token=token)['stopped']
        return wait_run(identifier, lambda r: r['steps']['probe']['status'] == 'suspended', '개별 작업 중지 확인')

    def recover(identifier, run, decision, **fields):
        return workflow('recoverTask', id=identifier, nodeId='probe', token=run['steps']['probe']['token'],
            decision=decision, tools=False, **fields)

    def approval_gate():
        identifier, proposal = plan()
        assert not workflow()['native'] and not workflow()['runs'], '승인 전 DSH 작업이 생성됐습니다.'
        assert [m['kind'] for m in rpc.view()['messages']] == ['user']
        payload = [{'nodeId': node['id'], 'agent': node['agent']} for node in proposal['draft']['nodes']]
        reject(lambda: approve(identifier, proposal, payload[:2]), '모든 작업')
        payload[0]['agent'] = next(member['id'] for member in workflow()['members'] if member['name'] == 'report')
        assert approve(identifier, proposal, payload)['id'] == identifier
        assert approve(identifier, proposal, list(reversed(payload)))['id'] == identifier
        run = wait_run(identifier, lambda r: r['status'] == 'complete', '승인 후 전체 완료')
        assert len(workflow()['native']) == 3 and len(workflow()['runs']) == 1
        native = next(task for task in workflow()['native'] if task['id'] == run['steps']['cause']['native'])
        assert native['ownerName'] == 'report'
        attached = wait_plan(identifier, 'approved')['run']
        assert attached['status'] == 'complete'
        assert [attached['steps'][key]['summary'] for key in ('cause','reproduce','final')] == [
            '원인 분석 완료', '재현 조건 완료', '결과 취합 완료']
        return {'nativeTasksBeforeApproval': 0, 'nativeTasksAfterApproval': 3, 'duplicateRuns': 0}

    def checkpoint():
        nonlocal rpc
        identifier, running = new_control()
        held = stop_probe(identifier, running)
        assert held['steps']['independent']['status'] == 'complete' and held['steps']['follow']['status'] == 'pending'
        assert held['steps']['probe']['hasCheckpoint']
        reject(lambda: workflow('stopTask', id=identifier, nodeId='probe', token=running['steps']['probe']['token']), '상태가 바뀌')
        host.stop(hard=True)
        rpc = Rpc(host.start())
        held = wait_run(identifier, lambda r: r['steps']['probe']['status'] == 'suspended', '재시작 후 중지 상태')
        assert held['steps']['probe']['hasCheckpoint']
        assert 'ALLOCATION_CHECKPOINT_RUNNING' not in host.logs()
        (host.cwd / 'resume-probe').touch()
        recover(identifier, held, 'resume')
        run = wait_run(identifier, lambda r: r['status'] == 'complete', '저장 상태 복구')
        assert run['steps']['probe']['summary'] == '저장된 지점부터 재개 완료'
        assert run['steps']['probe']['attempt'] == 1 and run['steps']['follow']['attempt'] == 1
        return {'checkpointSurvivedRestart': True, 'probeAttempts': 1}

    def invalid_checkpoint_and_restart():
        identifier, running = new_control()
        held = stop_probe(identifier, running)
        reject(lambda: recover(identifier, held, 'resume', text='wrong'), '재사용할 수 없습니다')
        assert wait_run(identifier, lambda r: r['steps']['probe']['status'] == 'suspended', '입력 변경 후 보류')['steps']['probe']['attempt'] == 1
        path = host.cwd / 'out' / 'resume.txt'
        path.write_text('changed on disk')
        reject(lambda: recover(identifier, held, 'resume'), '체크포인트 파일이 바뀌어')
        recover(identifier, held, 'restart', text='corrected')
        result = wait_run(identifier, lambda r: r['status'] == 'complete', '교정 입력으로 처음부터 실행')
        assert result['steps']['probe']['summary'] == '수정 입력으로 새로 실행 완료'
        assert result['steps']['probe']['attempt'] == 2
        assert not result['steps']['probe'].get('hasCheckpoint')

    def cancel():
        identifier, running = new_control()
        held = stop_probe(identifier, running)
        recover(identifier, held, 'cancel')
        result = wait_run(identifier, lambda r: r['status'] == 'blocked', '후속 작업 보류')
        assert result['steps']['probe']['status'] == 'cancelled'
        assert result['steps']['follow']['status'] == 'pending' and result['steps']['follow']['attempt'] == 0
        assert '취소됨' in result['steps']['follow']['waiting']
        assert result['steps']['independent']['status'] == 'complete'

    def stop_room():
        identifier, _ = new_control()
        pending_id, pending_plan = plan('@lead 두 번째 요청을 팀원들이 나눠 분석해줘')
        legacy_active = rpc.send('@lead 중지 테스트')
        rpc.wait(lambda r: r['activeId'] == legacy_active and any(m.get('replyTo') == legacy_active
            and m['status'] == 'running' for m in r['messages']), '일반 채팅 Agent 실행')
        legacy_queued = rpc.send('@lead 대기 중인 추가 요청')
        assert rpc.room('stop', teamId=TEAM, mode='all') == {'stopped': True}
        stopped = rpc.wait(lambda r: not r['active'] and not r['queued'], '일반 채팅과 대기열 중지')
        statuses = {m['id']: m['status'] for m in stopped['messages']}
        assert statuses[legacy_active] == statuses[legacy_queued] == 'stopped'
        run = wait_run(identifier, lambda r: r['steps']['probe']['status'] == 'suspended', '워크플로우 동시 중지')
        assert run['steps']['follow']['status'] == 'suspended' and run['steps']['follow']['attempt'] == 0
        assert wait_plan(pending_id, 'stopped')
        reject(lambda: approve(pending_id, pending_plan), '중지됐습니다')
        new_id, new_proposal = plan('@lead 중지 후 새 로그 요청을 나눠 분석해줘')
        approve(new_id, new_proposal)
        assert wait_run(new_id, lambda r: r['status'] == 'complete', '중지 뒤 새 요청')

    for number, test in enumerate([approval_gate, checkpoint, invalid_checkpoint_and_restart, cancel, stop_room], 1):
        if not record(f'AL-{number:02}', test):
            break


def run_allocation_browser(host, archive, record, chromium):
    host.install(archive)
    address = host.start()
    with sync_playwright() as playwright:
        args = ['--disable-dev-shm-usage', '--no-proxy-server']
        if os.environ.get('TEAM_CHAT_CHROMIUM_SINGLE_PROCESS') == '1':
            args += ['--single-process', '--no-zygote', '--disable-gpu', '--no-sandbox']
        browser = playwright.chromium.launch(executable_path=chromium, headless=True, args=args)
        page = browser.new_page(viewport={'width': 1450, 'height': 940}, locale='ko-KR')
        page.set_default_timeout(16_000)
        dismiss_preview_notice(page)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def chat(text):
            page.get_by_role('textbox', name='메시지', exact=True).fill(text)
            page.get_by_role('button', name='보내기', exact=True).click()

        def plan_approval():
            page.goto(address, wait_until='domcontentloaded')
            page.get_by_role('button', name='Team Chat', exact=True).click(timeout=25_000)
            page.locator('.tc-room-link').filter(has_text='검증 팀').click()
            page.get_by_label('방 이름').fill('팀 업무 배분')
            page.get_by_role('button', name='저장', exact=True).click()
            chat('@lead 이 로그를 팀원들이 나눠 분석해줘')
            card = page.get_by_role('form', name='리드 배분안')
            card.get_by_label('원인 분석 담당 Agent').select_option(label='@report')
            assert page.locator('.tc-message.tc-bot').count() == 0
            page.screenshot(path=str(host.workdir / 'approval.png'))
            card.get_by_role('button', name='배분안 전체 승인', exact=True).click()
            result = page.get_by_role('region', name='Agent별 실행 결과').first
            result.get_by_text('결과 취합 완료', exact=True).wait_for()
            assert result.get_by_role('listitem', name='원인 분석 결과').get_by_text('@report', exact=True).count() == 1
            result.locator('.tc-wf-status[data-state=complete]').nth(3).wait_for()
            page.screenshot(path=str(host.workdir / 'results.png'))
            return {'browser': browser.version, 'results': 3}

        def recovery():
            page.get_by_role('button', name='업무 나누기', exact=True).click()
            chat('중지 시험')
            page.get_by_role('button', name='배분안 전체 승인', exact=True).click()
            probe = page.get_by_role('listitem', name='입력 검증 결과')
            probe.get_by_text('체크포인트 저장됨', exact=True).wait_for()
            probe.get_by_text('실행 중', exact=True).wait_for()
            probe.get_by_role('button', name='이 작업만 중지', exact=True).click()
            probe.get_by_text('중지됨', exact=True).wait_for()
            probe.get_by_role('button', name='복구 선택', exact=True).click()
            probe.get_by_role('textbox', name='교정한 입력').fill('corrected')
            probe.get_by_role('button', name='중단 지점부터 재개', exact=True).click()
            probe.get_by_role('alert').get_by_text('재사용할 수 없습니다', exact=False).wait_for()
            probe.get_by_role('button', name='처음부터 재실행', exact=True).click()
            probe.get_by_text('수정 입력으로 새로 실행 완료', exact=True).wait_for()

        def all_stop():
            chat('@lead 이 신규 요청을 팀원들에게 배분해줘')
            page.get_by_role('button', name='배분안 전체 승인', exact=True).wait_for()
            page.get_by_role('button', name='방 전체 중지', exact=True).click()
            page.get_by_role('button', name='배분안 전체 승인', exact=True).wait_for(state='hidden')
            page.locator('.tc-allocation-note').filter(has_text='방 전체 중지').wait_for()
            assert not errors, errors

        for number, test in enumerate([plan_approval, recovery, all_stop], 1):
            if not record(f'AUI-{number:02}', test):
                page.screenshot(path=str(host.workdir / 'failure.png'))
                print('화면 오류:', page.get_by_role('alert').all_text_contents(), flush=True)
                break
        browser.close()


def run_allocation_migration(host, previous, archive, record):
    def upgrade():
        host.install(previous)
        before = Rpc(host.start())
        before.save_room()
        def workflow(rpc, action='view', **data):
            return rpc.room('workflow', teamId=TEAM, input={'action': action, **data})

        old = workflow(before)
        roster = {member['name']: member['id'] for member in old['members']}
        def step(identifier, who, instruction, after=()):
            return {'id': identifier, 'title': identifier, 'agent': roster[who], 'group': None,
                'instruction': instruction, 'completion': '', 'needsDevice': False, 'tools': False, 'outputs': [],
                'after': [{'from': source, 'when': 'success'} for source in after]}
        draft = {'title': '보존할 기존 흐름', 'layout': 'sequence', 'groups': [], 'nodes': [
            step('ask', 'watch', 'wf-ask'), step('report', 'report', 'wf-simple', ['ask']),
        ]}
        revision = workflow(before, 'draft', draft=draft, revision=old['revision'])['revision']
        version = workflow(before, 'publish', revision=revision)['version']
        identifier = uid()
        workflow(before, 'start', id=identifier, input='', device='', tools=False, version=version)
        def snapshot(rpc, predicate, label):
            return bounded_wait(lambda: next((run for run in workflow(rpc)['runs'] if run['id'] == identifier and predicate(run)), None), label)

        held = snapshot(before, lambda r: r['steps']['ask']['status'] == 'question', '0.3.0 질문 대기')
        question_id = held['steps']['ask']['question']['id']
        native_ids = {name: step['native'] for name, step in held['steps'].items()}
        host.stop()
        host.remove()
        host.install(archive)
        after = Rpc(host.start())
        state = workflow(after)
        assert state['draft'] == draft
        assert {member['name']: member['id'] for member in state['members']} == roster
        run = snapshot(after, lambda r: r['steps']['ask']['status'] == 'question', '0.3.1 질문 복구')
        assert run['steps']['ask']['question']['id'] == question_id
        workflow(after, 'answer', id=identifier, nodeId='ask', questionId=question_id, text='같은 장비')
        done = snapshot(after, lambda r: r['status'] == 'complete', '업그레이드 후 기존 실행 완료')
        assert {name: step['native'] for name, step in done['steps'].items()} == native_ids
        assert len(workflow(after)['native']) == 2
        return {'sameExistingAgents': len(roster), 'sameNativeTasks': len(native_ids), 'questionPreserved': True}
    record('AM-01', upgrade)


def run_checkpoint_upgrade(host, previous, archive, record):
    def upgrade():
        def wf(rpc, action='view', **data):
            return rpc.room('workflow', teamId=TEAM, input={'action': action, **data})
        def run(rpc, identifier, condition, label):
            return bounded_wait(lambda: next((item for item in wf(rpc)['runs'] if item['id'] == identifier and condition(item)), None),
                label, seconds=22)

        host.install(previous)
        before = Rpc(host.start())
        before.save_room()
        identifier = before.send('@lead 중지 시험을 팀원들이 나눠 진행해줘')
        def proposal():
            item = next((m.get('assignment') for m in before.view()['messages'] if m['id'] == identifier), None)
            return item if item and item['status'] == 'review' else None
        plan = bounded_wait(proposal, '0.3.1 배분안')
        wf(before, 'approveAllocation', id=identifier, revision=plan['revision'], input='', device='',
            assignments=[{'nodeId': node['id'], 'agent': node['agent']} for node in plan['draft']['nodes']])
        active = run(before, identifier, lambda r: r['steps']['probe']['status'] == 'running'
            and r['steps']['probe'].get('hasCheckpoint'), '0.3.1 체크포인트')
        wf(before, 'stopTask', id=identifier, nodeId='probe', token=active['steps']['probe']['token'])
        stopped = run(before, identifier, lambda r: r['steps']['probe']['status'] == 'suspended', '0.3.1 중지')
        native_ids = {name: step['native'] for name, step in stopped['steps'].items()}
        host.stop()
        host.remove()
        host.install(archive)
        after = Rpc(host.start())
        restored = run(after, identifier, lambda r: r['steps']['probe']['status'] == 'suspended', '0.3.2 호환 복구')
        assert restored['steps']['probe']['hasCheckpoint']
        (host.cwd / 'resume-probe').touch()
        wf(after, 'recoverTask', id=identifier, nodeId='probe', token=restored['steps']['probe']['token'],
            decision='resume', tools=False)
        done = run(after, identifier, lambda r: r['status'] == 'complete', '기존 체크포인트 재개')
        assert done['steps']['probe']['attempt'] == 1
        assert {name: step['native'] for name, step in done['steps'].items()} == native_ids
        assert done['steps']['probe']['summary'] == '저장된 지점부터 재개 완료'
        return {'sameNativeTasks': len(native_ids), 'probeAttempts': 1, 'checkpointValidated': True}
    record('AU-01', upgrade)
