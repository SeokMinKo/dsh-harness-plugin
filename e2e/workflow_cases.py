"""Native Agent Team task execution and the shared chat/visual workflow editor."""

import hashlib
import os
import time

from playwright.sync_api import sync_playwright

from browser_cases import dismiss_preview_notice
from harness import Rpc, RpcError, TEAM, bounded_wait, uid


def run_workflow_host(host, archive, record):
    host.install(archive)
    rpc = Rpc(host.start())
    rpc.save_room()

    def command(action='view', **fields):
        return rpc.room('workflow', teamId=TEAM, input={'action': action, **fields})

    def wait_run(identifier, predicate, label):
        def find():
            run = next((run for run in command()['runs'] if run['id'] == identifier), None)
            return run if run and predicate(run) else None
        return bounded_wait(find, label, seconds=22)

    def step(identifier, who, instruction, after=(), **settings):
        member = next(row['id'] for row in command()['members'] if row['name'] == who)
        return {'id': identifier, 'title': identifier, 'agent': member, 'group': None, 'instruction': instruction,
            'completion': '', 'needsDevice': False, 'tools': False, 'outputs': [],
            'after': [{'from': source, 'when': when} for source, when in after], **settings}

    def save(nodes, title='Workflow fixture'):
        current = command()
        draft = {'title': title, 'layout': 'mixed', 'groups': [], 'nodes': nodes}
        draft_revision = command('draft', revision=current['revision'], draft=draft)['revision']
        version = command('publish', revision=draft_revision)['version']
        return version, draft

    def start(version, device='', tools=False):
        identifier = uid()
        assert command('start', id=identifier, version=version, input='', device=device, tools=tools)['id'] == identifier
        return identifier

    def reject(action, snippet):
        try:
            action()
        except RpcError as error:
            assert snippet in str(error), str(error)
        else:
            raise AssertionError('잘못된 요청이 수락됐습니다.')

    def scoped_questions_and_parallel():
        nodes = [
            step('ask', 'watch', 'wf-ask'),
            step('second', 'lead', 'wf-ask-second'),
            step('independent', 'report', 'wf-independent'),
            step('verify', 'test', 'wf-artifact', [('ask', 'success')], outputs=['out/verify.txt']),
            step('metadata', 'report', 'wf-artifact', [('ask', 'success')]),
            step('join', 'lead', 'wf-join', [('verify', 'success'), ('metadata', 'success')]),
        ]
        version, _ = save(nodes)
        identifier = start(version)
        held = wait_run(identifier, lambda r: [r['steps'][name]['status'] for name in ('ask','second','independent')]
            == ['question','question','complete'], '질문 두 개와 독립 작업 완료')
        assert held['steps']['verify']['status'] == 'pending'
        second = held['steps']['second']['question']['id']
        first = held['steps']['ask']['question']['id']
        reject(lambda: command('answer', id=identifier, nodeId='ask', questionId=second, text='잘못된 답'), '이미 답변')
        command('answer', id=identifier, nodeId='ask', questionId=first, text='fixture-device-42')
        report = wait_run(identifier, lambda r: r['steps']['join']['status'] == 'complete', '병렬 단계와 합류')
        assert report['steps']['second']['question']['id'] == second
        assert report['steps']['join']['summary'] == '두 결과와 SHA-256 확인'
        assert report['steps']['join']['attempt'] == 1
        for name in ('verify', 'metadata'):
            expected = hashlib.sha256(f'artifact for {name}'.encode()).hexdigest()
            assert report['steps'][name]['artifacts'][0]['sha256'] == expected
        logs = host.logs()
        assert max(logs.index('WF_PARALLEL_START ' + name) for name in ('verify','metadata')) < min(
            logs.index('WF_PARALLEL_END ' + name) for name in ('verify','metadata')), '두 실행이 실제로 겹치지 않았습니다.'
        command('answer', id=identifier, nodeId='second', questionId=second, text='Markdown')
        complete = wait_run(identifier, lambda r: r['status'] == 'complete', '두 번째 답변')
        native = {task['id']: task for task in command()['native']}
        assert all(native[item['native']]['status'] == 'completed' for item in complete['steps'].values())
        assert native[complete['steps']['join']['native']]['blockedBy'] == [
            complete['steps'][name]['native'] for name in ('verify','metadata')]
        return {'nativeTasks': len(complete['steps']), 'overlappingTurns': 2, 'scopedQuestions': 2, 'joinAttempts': 1}

    def failure_conditions():
        version, _ = save([
            step('failure', 'lead', 'wf-failure'),
            step('blocked', 'watch', 'wf-simple', [('failure', 'success')]),
            step('diagnose', 'test', 'wf-simple', [('failure', 'failure')]),
            step('missing', 'report', 'wf-missing', [('failure', 'settled')], outputs=['out/missing.txt']),
        ])
        run = wait_run(start(version), lambda r: r['status'] == 'failed', '실패 분기 완료')
        assert {id: value['status'] for id, value in run['steps'].items()} == {
            'failure': 'failed', 'blocked': 'skipped', 'diagnose': 'complete', 'missing': 'failed'}, run['steps']
        assert run['steps']['blocked']['attempt'] == 0 and 'missing.txt' in run['steps']['missing']['detail']

    def edit_and_tools():
        version, draft = save([step('ask', 'watch', 'wf-ask'),
            step('following', 'test', 'wf-simple', [('ask', 'success')], tools=True)])
        identifier = start(version)
        held = wait_run(identifier, lambda r: r['steps']['ask']['status'] == 'question', '편집 전 질문')
        now = command()['revision']
        draft['nodes'][1]['agent'] = next(member['id'] for member in command()['members'] if member['name'] == 'report')
        rev = command('draft', revision=now, draft=draft)['revision']
        reject(lambda: command('draft', revision=now, draft=draft), '다른 창')
        reject(lambda: command('apply', id=identifier, revision=rev, runRevision=held['revision'] - 1), '실행 상태')
        command('apply', id=identifier, revision=rev, runRevision=held['revision'])
        command('answer', id=identifier, nodeId='ask', questionId=held['steps']['ask']['question']['id'], text='test')
        approval = wait_run(identifier, lambda r: r['steps']['following']['status'] == 'approval', '도구 권한 대기')
        assert approval['steps']['following']['attempt'] == 0
        command('authorize', id=identifier, nodeId='following', attempt=0)
        finished = wait_run(identifier, lambda r: r['status'] == 'complete', '권한 후 완료')
        native = next(task for task in command()['native'] if task['id'] == finished['steps']['following']['native'])
        assert native['ownerName'] == 'report'

    def crash_and_recover():
        nonlocal rpc
        version, _ = save([step('device', 'lead', 'wf-crash', needsDevice=True),
            step('after', 'test', 'wf-simple', [('device', 'success')])])
        identifier = start(version, device='virtual-001')
        bounded_wait(lambda: 'WF_CRASH_START' in host.logs(), '테스트 장비 턴 시작')
        host.stop(hard=True)
        rpc = Rpc(host.start())
        run = wait_run(identifier, lambda r: r['steps']['device']['status'] == 'interrupted', '재시작 후 중단')
        blocked_id = start(version, device='virtual-001')
        blocked = wait_run(blocked_id, lambda r: r['steps']['device'].get('waiting') == '장비 상태 확인 대기', '장비 잠금 복구')
        assert blocked['steps']['device']['attempt'] == 0 and 'WF_CRASH_START' not in host.logs()
        (host.cwd / 'resume-fixture').touch()
        command('retry', id=identifier, nodeId='device', attempt=run['steps']['device']['attempt'], decision='retry', tools=False)
        done = wait_run(identifier, lambda r: r['status'] == 'complete', '명시적 복구와 후속 작업')
        assert done['steps']['device']['attempt'] == 2 and done['steps']['after']['attempt'] == 1
        assert 'WF_CRASH_START' not in host.logs()

    def folder_dedupe():
        version, _ = save([step('file', 'watch', 'wf-input', needsDevice=True)], title='Folder fixture')
        folder = host.cwd / 'incoming'
        folder.mkdir()
        (folder / 'before.bin').write_bytes(b'preexisting')
        command('folder', revision=command()['revision'],
            folder={'directory':'incoming', 'suffix':'.bin', 'device':'folder-device', 'enabled':True})
        target = folder / 'firmware.bin'
        target.write_bytes(b'header')
        time.sleep(.28)
        target.write_bytes(b'header payload')
        def triggered():
            runs = [run for run in command()['runs'] if run['version'] == version and run['source'] == 'folder']
            return runs if len(runs) == 1 and runs[0]['status'] == 'complete' else None
        first = bounded_wait(triggered, '안정된 파일에서 1회 실행', seconds=18)[0]
        (folder / 'duplicate.bin').write_bytes(b'header payload')
        time.sleep(2.8)
        assert len([r for r in command()['runs'] if r['version'] == version]) == 1
        assert first['inputHash'] == hashlib.sha256(b'header payload').hexdigest()
        return {'hash': first['inputHash'], 'samePayloadRuns': 1}

    def traversal():
        reject(lambda: command('folder', revision=command()['revision'],
            folder={'directory':'../', 'suffix':'.bin', 'device':'folder-device', 'enabled':True}), '작업 공간')
        assert command()['folder']['directory'] == 'incoming'

    def exclusive_resources():
        version, _ = save([
            step('device-a', 'watch', 'wf-artifact', needsDevice=True),
            step('device-b', 'test', 'wf-artifact', needsDevice=True),
            step('agent-b', 'test', 'wf-artifact'),
        ])
        result = wait_run(start(version, device='exclusive-fixture'), lambda run: run['status'] == 'complete', '같은 Agent와 장비 직렬화')
        logs = host.logs()
        first = logs.index('WF_PARALLEL_END device-a')
        second = logs.index('WF_PARALLEL_START device-b')
        assert first < second
        intervals = [[logs.index('WF_PARALLEL_' + boundary + ' ' + id) for boundary in ('START', 'END')]
            for id in ('device-b', 'agent-b')]
        assert intervals[0][1] < intervals[1][0] or intervals[1][1] < intervals[0][0]
        assert [step['attempt'] for step in result['steps'].values()] == [1, 1, 1]

    cases = [scoped_questions_and_parallel, failure_conditions, edit_and_tools, crash_and_recover, folder_dedupe, traversal, exclusive_resources]
    for number, test in enumerate(cases, 1):
        record(f'WF-{number:02}', test)


def run_workflow_browser(host, archive, record, chromium):
    host.install(archive)
    address = host.start()
    base = address.split('?', 1)[0]
    with sync_playwright() as playwright:
        args = ['--disable-dev-shm-usage', '--no-proxy-server']
        if os.environ.get('TEAM_CHAT_CHROMIUM_SINGLE_PROCESS') == '1':
            args += ['--single-process', '--no-zygote', '--disable-gpu', '--no-sandbox']
        browser = playwright.chromium.launch(executable_path=chromium, headless=True, args=args)
        context = browser.new_context(viewport={'width': 1510, 'height': 960}, locale='ko-KR')
        context.set_default_timeout(16_000)
        page = context.new_page()
        dismiss_preview_notice(page)
        issues = []
        sockets = []
        def observe(socket):
            socket.connect_to_server()
            sockets.append(socket)
        page.route_web_socket('**/api/remote.mux*', observe)
        page.on('pageerror', lambda error: issues.append(str(error)))

        def open_room(tab, url, create=False):
            tab.goto(url, wait_until='domcontentloaded')
            tab.get_by_role('button', name='Team Chat', exact=True).click(timeout=25_000)
            if create:
                tab.locator('.tc-room-link').filter(has_text='검증 팀').click()
                tab.get_by_label('방 이름').fill('펌웨어 실험실')
                tab.get_by_role('button', name='저장', exact=True).click()
            tab.get_by_role('textbox', name='메시지', exact=True).wait_for()
            tab.get_by_role('button', name='워크플로우', exact=True).click()
            tab.get_by_label('워크플로우 이름', exact=True).wait_for()

        def design(text):
            if not page.get_by_role('textbox', name='채팅으로 워크플로우 설계').is_visible():
                page.get_by_role('button', name='채팅으로 설계', exact=True).click()
            page.get_by_role('textbox', name='채팅으로 워크플로우 설계').fill(text)
            page.get_by_role('button', name='설계 제안 받기').click()

        def from_chat():
            open_room(page, address, create=True)
            design('모호한 설계')
            page.get_by_text('검증을 어느 Agent에게 맡길까요?', exact=False).wait_for()
            assert page.locator('.tc-wf-node').count() == 0
            design('@watch 다음에 @test와 @lead 병렬, @report가 최종 보고해')
            page.get_by_text('검증과 메타데이터 정리를 병렬 실행하고 결과를 합칩니다.').wait_for()
            assert page.get_by_label('워크플로우 이름', exact=True).input_value() == '워크플로우'
            preview = page.locator('.tc-wf-preview').get_by_role('region', name='작업 관계도', exact=True)
            preview.get_by_role('button', name='최종 보고', exact=True).wait_for()
            assert preview.locator('path[marker-end]').count() == 4
            assert preview.get_by_role('button', name='펌웨어 검증 → 최종 보고 · 성공 후', exact=True).count() == 0
            page.get_by_role('button', name='초안에 반영', exact=True).click()
            preview.wait_for(state='detached')
            chart.get_by_role('button', name='펌웨어 검증', exact=True).wait_for()
            verify = chart.get_by_role('button', name='펌웨어 검증', exact=True).bounding_box()
            metadata = chart.get_by_role('button', name='메타데이터 정리', exact=True).bounding_box()
            report = chart.get_by_role('button', name='최종 보고', exact=True).bounding_box()
            assert verify['y'] == metadata['y'] < report['y'] and verify['x'] != metadata['x']
            assert page.get_by_label('워크플로우 이름', exact=True).input_value() == '펌웨어 검증 흐름'
            return {'browser': browser.version, 'proposedNodes': 4, 'dependencyArrows': 4}

        chart = page.get_by_role('region', name='작업 관계도', exact=True)

        def edge(source, target, condition):
            return chart.get_by_role('button', name=f'{source} → {target} · {condition}', exact=True)

        def edit_bidirectional():
            chart.get_by_role('button', name='펌웨어 검증', exact=True).press('Enter')
            assignment = chart.get_by_label('펌웨어 검증 담당 Agent', exact=True)
            assignment.select_option(label='@report')
            chart.get_by_role('button', name='편집 닫기', exact=True).click()
            edge('펌웨어 검증', '최종 보고', '성공 후').press('Enter')
            chart.get_by_label('연결 실행 조건', exact=True).select_option('failure')
            edge('펌웨어 검증', '최종 보고', '실패 시').wait_for()
            chart.get_by_role('button', name='편집 닫기', exact=True).click()
            chart.get_by_role('button', name='최종 보고', exact=True).click()
            chart.get_by_role('button', name='연결 추가', exact=True).click()
            assert chart.get_by_role('button', name='펌웨어 확인', exact=True).is_disabled()
            chart.get_by_role('button', name='연결 취소', exact=True).click()
            chart.get_by_role('button', name='펌웨어 확인', exact=True).click()
            chart.get_by_role('button', name='연결 추가', exact=True).click()
            assert chart.get_by_role('button', name='펌웨어 확인', exact=True).is_disabled()
            assert chart.get_by_role('button', name='펌웨어 검증', exact=True).is_disabled()
            chart.get_by_role('button', name='최종 보고', exact=True).click()
            chart.get_by_role('button', name='편집 닫기', exact=True).click()
            edge('펌웨어 확인', '최종 보고', '성공 후').click()
            chart.get_by_role('button', name='연결 삭제', exact=True).click()
            edge('펌웨어 확인', '최종 보고', '성공 후').wait_for(state='detached')
            design('선택한 작업은 둘 다 종료 후 보고')
            page.get_by_text('실패를 포함한 종료 후 보고로 변경합니다.').wait_for()
            page.get_by_role('button', name='초안에 반영', exact=True).click()
            page.locator('.tc-wf-preview').wait_for(state='detached')
            edge('펌웨어 검증', '최종 보고', '종료 후').wait_for()
            edge('메타데이터 정리', '최종 보고', '종료 후').wait_for()
            chart.get_by_role('button', name='펌웨어 검증', exact=True).click()
            assert assignment.locator('option:checked').inner_text() == '@report'
            page.get_by_role('button', name='일반 채팅', exact=True).click()
            page.get_by_role('button', name='버전 저장', exact=True).click()
            page.get_by_text('v1 저장됨', exact=True).wait_for()

        def views_and_reopen():
            page.get_by_text('계층 그룹 편집', exact=True).click()
            page.get_by_role('button', name='그룹 추가', exact=True).click()
            page.get_by_label('그룹 이름', exact=True).fill('검증·보고 그룹')
            page.get_by_label('그룹 담당 Agent', exact=True).select_option(label='@lead')
            chart.get_by_role('button', name='최종 보고', exact=True).click()
            page.get_by_label('소속 그룹').select_option(label='검증·보고 그룹')
            page.get_by_role('button', name='초안 저장', exact=True).click()
            page.wait_for_function("document.querySelector('.tc-wf-save button').disabled")
            open_room(page, base)
            chart.get_by_text('검증·보고 그룹', exact=True).wait_for()
            edge('메타데이터 정리', '최종 보고', '종료 후').wait_for()
            page.locator('.tc-wf-panel').screenshot(path=str(host.workdir / 'workflow-panel.png'))
            page.set_viewport_size({'width': 390, 'height': 800})
            edge('메타데이터 정리', '최종 보고', '종료 후').click()
            editor = chart.get_by_label('연결 실행 조건', exact=True)
            editor.wait_for()
            bounds = editor.bounding_box()
            assert 0 <= bounds['x'] < bounds['x'] + bounds['width'] <= 390
            page.locator('.tc-wf-panel').screenshot(path=str(host.workdir / 'workflow-narrow.png'))
            page.set_viewport_size({'width': 1510, 'height': 960})

        def run_status():
            page.get_by_role('button', name='실행 상태', exact=True).click()
            page.get_by_role('button', name='워크플로우 실행', exact=True).click()
            status = page.locator('.tc-wf-node').filter(has=page.get_by_role('button', name='최종 보고', exact=True))
            status.get_by_text('완료', exact=True).wait_for()
            status.get_by_role('button', name='최종 보고', exact=True).click()
            page.get_by_text('최종 보고 · 완료', exact=True).wait_for()
            page.get_by_role('button', name='채팅 기록 보기', exact=True).click()
            assert page.get_by_role('button', name='워크플로우 작업 보기').count() == 4
            assert not issues, issues
            page.screenshot(path=str(host.workdir / 'workflow-run.png'))

        def conflict():
            second = context.new_page()
            dismiss_preview_notice(second)
            open_room(second, base)
            page.get_by_role('button', name='편집', exact=True).click()
            page.get_by_label('워크플로우 이름', exact=True).fill('첫 창')
            second.get_by_label('워크플로우 이름', exact=True).fill('두 번째 창')
            second.get_by_role('button', name='초안 저장', exact=True).click()
            page.get_by_text('다른 창에서 초안을 변경했습니다', exact=True).wait_for()
            warning = page.locator('.tc-wf-notice').filter(has_text='다른 창에서 초안을 변경했습니다')
            warning.get_by_role('combobox').select_option('local')
            warning.get_by_role('button', name='변경 합치기', exact=True).click()
            assert page.get_by_label('워크플로우 이름', exact=True).input_value() == '첫 창'
            page.get_by_role('button', name='초안 저장', exact=True).click()
            second.wait_for_function("document.querySelector('.tc-wf-panel input').value === '첫 창'")
            second.close()

        def answer_question():
            page.get_by_role('button', name='펌웨어 확인', exact=True).click()
            page.get_by_role('group', name='작업 세부 설정', exact=True).locator('textarea').fill('wf-ask')
            page.get_by_role('button', name='버전 저장', exact=True).click()
            page.get_by_text('v2 저장됨', exact=True).wait_for()
            page.get_by_role('button', name='실행 상태', exact=True).click()
            page.get_by_role('button', name='워크플로우 실행', exact=True).click()
            card = page.locator('.tc-wf-node').filter(has=page.get_by_role('button', name='펌웨어 확인', exact=True))
            card.get_by_text('답변 대기', exact=True).wait_for()
            page.locator('.tc-message').filter(has_text='가짜 장비 ID를 알려 주세요.').get_by_role('button', name='워크플로우 작업 보기').click()
            page.get_by_role('button', name='채팅에서 답변', exact=True).click()
            page.get_by_role('textbox', name='작업 질문에 답변', exact=True).fill('desktop-fixture')
            page.get_by_role('button', name='답변 보내기', exact=True).click()
            card.get_by_text('완료', exact=True).wait_for()
            page.locator('.tc-message').get_by_text('장비 확인 · desktop-fixture', exact=True).wait_for()
            page.set_viewport_size({'width': 700, 'height': 830})
            assert page.locator('.tc-wf-panel').is_visible()
            page.get_by_role('button', name='워크플로우 닫기').click()
            page.get_by_role('textbox', name='메시지', exact=True).wait_for()
            assert not issues, issues

        def reconnect_workflow():
            page.set_viewport_size({'width': 1510, 'height': 960})
            page.get_by_role('button', name='워크플로우', exact=True).click()
            page.get_by_role('button', name='실행 상태', exact=True).click()
            page.get_by_role('button', name='워크플로우 실행', exact=True).click()
            first = page.locator('.tc-wf-node').filter(has=page.get_by_role('button', name='펌웨어 확인', exact=True))
            first.get_by_text('답변 대기', exact=True).wait_for()
            second = context.new_page()
            dismiss_preview_notice(second)
            open_room(second, base)
            second.get_by_role('button', name='실행 상태', exact=True).click()
            second.get_by_role('button', name='펌웨어 확인', exact=True).click()
            previous = len(sockets)
            assert previous > 0
            sockets[-1].close(code=1012, reason='Workflow reconnect')
            second.get_by_role('button', name='채팅에서 답변', exact=True).click()
            second.get_by_role('textbox', name='작업 질문에 답변', exact=True).fill('reconnected-workflow')
            second.get_by_role('button', name='답변 보내기', exact=True).click()
            first.get_by_text('완료', exact=True).wait_for()
            assert len(sockets) > previous
            result = page.get_by_text('장비 확인 · reconnected-workflow', exact=True)
            result.wait_for()
            assert result.count() == 1
            second.close()
            return {'reconnected': True, 'responseCount': 1}

        for number, test in enumerate([from_chat, edit_bidirectional, views_and_reopen, run_status, conflict, answer_question, reconnect_workflow], 1):
            if not record(f'WUI-{number:02}', test):
                page.screenshot(path=str(host.workdir / 'workflow-error.png'))
                print('화면 오류:', page.locator('.tc-error:visible').all_text_contents(), '페이지 오류:', issues, flush=True)
                break
        browser.close()
