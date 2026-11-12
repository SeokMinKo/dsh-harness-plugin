"""Team Chat RPC, process recovery, and upgrade on the native DSH host."""

from concurrent.futures import ThreadPoolExecutor
import json
import re
from urllib.error import HTTPError

from harness import Rpc, RpcError, TEAM, bounded_wait, uid


def rejects(action, detail):
    try:
        action()
    except RpcError as error:
        assert detail in str(error), str(error)
    else:
        raise AssertionError('RPC가 잘못된 입력을 수락했습니다. ' + detail)


def idle(view):
    return not view['active'] and not view['awaiting'] and view['queued'] == 0


def paused(view):
    return not view['active'] and view['awaiting']


def streaming(rpc, root, text='작업 중입니다.'):
    return rpc.wait(lambda v: v['activeId'] == root and any(m['text'] == text and m['status'] == 'running'
        for m in v['messages']), '응답 스트리밍')


def stop_all(rpc, view):
    assert rpc.room('stop', teamId=TEAM, mode='all', activeId=view['activeId'],
        runId=view['activeRunId']) == {'stopped': True}
    return rpc.wait(idle, '전체 중지')


def run_host(host, archive, record):
    host.install(archive)
    address = host.start()
    rpc = Rpc(address)
    rpc.save_room()

    def permission():
        try:
            Rpc(address, authenticate=False).room('list')
        except HTTPError as error:
            assert error.code == 401, error
        else:
            raise AssertionError('인증 없이 플러그인 RPC가 실행됐습니다.')
        rejects(lambda: rpc.send('@all 도구 사용', tools=True), '팀원 한 명')
        assert not rpc.view()['messages']

    def native_turn():
        root = rpc.send('@lead 원본 동시 검증')
        streaming(rpc, root, '방 응답 생성 중')
        assert rpc.steer('원본 별도 입력')['accepted']
        rows = rpc.settled(root)
        logs = bounded_wait(lambda: host.logs() if 'AUDIT_ORIGINAL_TURN' in host.logs() else None, '원본 native turn')
        assert [m['text'] for m in rows] == ['@lead 원본 동시 검증', '방 응답 생성 중 · 방 응답 완료'], rows
        room = int(re.search(r'AUDIT_ROOM_TURN (\d+)', logs)[1])
        original = int(re.search(r'AUDIT_ORIGINAL_TURN (\d+)', logs)[1])
        assert original == room + 1, (room, original)
        return {'roomNativeTurn': room, 'originalNativeTurn': original}

    def provisional():
        before = host.logs().count('AUDIT_NOOP_EXECUTED')
        rows = rpc.settled(rpc.send('@lead 도구 전 문장 검증', tools=True))
        assert [m['status'] for m in rows] == ['failed', 'failed'] and rows[1]['author'] == 'lead', rows
        assert '최종 텍스트 응답' in rows[1]['error']
        assert host.logs().count('AUDIT_NOOP_EXECUTED') == before + 1

    def long_handoff():
        rows = rpc.settled(rpc.send('@lead 긴 답변 인계'))
        assert len(rows) == 3 and rows[0]['status'] == 'complete'
        assert rows[1]['truncated'] and len(rows[1]['text']) <= 12000
        assert rows[2]['author'] == 'test' and rows[2]['text'] == '긴 응답 끝부분 확인', rows[-1]
        return {'previewCharacters': len(rows[1]['text']), 'handoffRecipient': rows[2]['author']}

    def fan_in():
        rows = rpc.settled(rpc.send('@watch @test @report 둘 다 인계'))
        assert rows[0]['status'] == 'complete' and [m['author'] for m in rows[1:]] == ['watch', 'test', 'report'], rows
        assert rows[-1]['text'] == 'report 두 인계 확인', rows[-1]

    def partial():
        rpc.save_room(rounds=1)
        try:
            rows = rpc.settled(rpc.send('@lead 라운드 한도'))
            assert len(rows) == 2 and rows[0]['status'] == 'partial', rows
            assert rows[1]['handoffWarnings'] == [{'name': 'report', 'reason': 'round-limit'}], rows
        finally:
            rpc.save_room(rounds=3)
        rows = rpc.settled(rpc.send('@lead @test 부분 실패'))
        assert [m['status'] for m in rows] == ['partial', 'complete', 'failed'], rows
        assert rows[2]['author'] == 'test' and rows[2]['error'], rows[2]

    def tools_scope():
        before = host.logs().count('AUDIT_NOOP_EXECUTED')
        direct = rpc.settled(rpc.send('@lead 권한 없는 도구'))
        handoff = rpc.settled(rpc.send('@lead 자동 인계 도구', tools=True))
        for rows, expected in ((direct, ['lead']), (handoff, ['lead', 'test'])):
            assert [m['author'] for m in rows[1:]] == expected, rows
            assert 'This room turn is text only' in rows[-1]['text'], rows[-1]
        assert host.logs().count('AUDIT_NOOP_EXECUTED') == before

    def idempotency():
        identifier = uid()
        message = '@lead 중복 전송 검증'
        with ThreadPoolExecutor(max_workers=2) as workers:
            requests = [workers.submit(rpc.send, message, id=identifier) for _ in range(2)]
            assert [request.result() for request in requests] == [identifier, identifier]
        rows = rpc.settled(identifier)
        assert len(rows) == 2 and rows[1]['status'] == 'complete', rows
        rejects(lambda: rpc.send('@lead 같은 ID 다른 본문', id=identifier), '요청 ID')
        view = rpc.view()
        assert sum(m['id'] == identifier for m in view['messages']) == 1
        assert sum(m.get('replyTo') == identifier for m in view['messages']) == 1

    def queue_limit():
        root = rpc.send('@lead 대기열 한도')
        held = rpc.wait(paused, '대기열 질문')
        question = held['awaiting']['messageId']
        rejects(lambda: rpc.save_room(rounds=2), '진행 중인 대화')
        for index in range(23):
            rpc.send(f'@lead 대기 항목 {index + 1}')
        assert rpc.view()['queued'] == 23
        rejects(lambda: rpc.send('@lead 대기열 초과'), '대기 중인 메시지가 너무 많습니다')
        answer = rpc.send('답변 슬롯 확인', reply_to=question)
        running = streaming(rpc, root)
        settled = stop_all(rpc, running)
        assert next(m for m in settled['messages'] if m['id'] == answer)['status'] == 'stopped'
        return {'ordinaryQueued': 23, 'waitingRoot': 1, 'questionAnswerAccepted': True}

    def stale_stop():
        root = rpc.send('@lead 중지 테스트')
        running = streaming(rpc, root)
        queued = rpc.send('@lead 중지할 대기 요청')
        assert rpc.room('stop', teamId=TEAM, mode='all', activeId=root, runId=uid()) == {'stopped': False}
        assert rpc.view()['activeRunId'] == running['activeRunId'] and rpc.view()['queued'] == 1
        view = stop_all(rpc, running)
        statuses = {m['id']: m['status'] for m in view['messages']}
        assert statuses[root] == statuses[queued] == 'stopped', statuses

    def nested_question():
        root = rpc.send('@lead 중첩 질문 시작')
        first = rpc.wait(paused, '첫 질문')['awaiting']['messageId']
        rpc.send('추가 질문 요청', reply_to=first)
        second = rpc.wait(lambda v: paused(v) and v['awaiting']['messageId'] != first, '두 번째 질문')['awaiting']['messageId']
        assert rpc.room('resume', teamId=TEAM, questionId=first) == {'resumed': False}
        assert rpc.view()['awaiting']['messageId'] == second
        assert rpc.room('resume', teamId=TEAM, questionId=second) == {'resumed': True}
        rows = rpc.settled(root)
        assert rows[0]['status'] == 'complete' and rows[-1]['text'] == '남은 report 실행 완료', rows

    def truncated_model_turn():
        rows = rpc.settled(rpc.send('@lead 출력 한도 검증'))
        assert len(rows) == 2 and [m['status'] for m in rows] == ['failed', 'failed'], rows
        assert '출력 토큰 한도' in rows[1]['error'] and '잘린 응답 예시' in rows[1]['text'], rows[1]
        assert '[[team-chat:' not in rows[1]['text'] and rows[1]['author'] == 'lead', rows[1]

    for index, case in enumerate((permission, native_turn, provisional, long_handoff, fan_in, partial,
            tools_scope, idempotency, queue_limit, stale_stop, nested_question, truncated_model_turn), start=1):
        if not record(f'HOST-{index:02}', case):
            rpc.room('stop', teamId=TEAM, mode='all')
            rpc.wait(idle, '다음 케이스를 위한 정리')
            rpc.save_room()


def assert_original_question(view, before):
    assert view['members'] == before['members']
    assert view['awaiting']['messageId'] == before['awaiting']['messageId']
    assert view['awaiting']['remaining'] == before['awaiting']['remaining'] == 2
    assert view['messages'][-1]['position'] == before['messages'][-1]['position']


def answer_original_question(rpc, before, root):
    rpc.send('조건 확정 42', reply_to=before['awaiting']['messageId'])
    settled = rpc.wait(idle, '질문 답변 및 인계 종결')
    assert next(m for m in settled['messages'] if m['id'] == root)['status'] == 'complete'
    generated = [m for m in settled['messages'] if m['kind'] == 'bot' and m['position'] > before['messages'][-1]['position']]
    assert [m['author'] for m in generated] == ['watch', 'test', 'report'], generated
    assert generated[-1]['text'] == 'report 요약: 조건 42 검증 완료'


def run_recovery(host, archive, record):
    host.install(archive)
    rpc = Rpc(host.start())
    rpc.save_room()

    def graceful():
        nonlocal rpc
        root = rpc.send('@watch @test 그룹 인계 질문')
        before = rpc.wait(paused, '재시작 전 질문')
        host.stop()
        rpc = Rpc(host.start())
        assert_original_question(rpc.view(), before)
        answer_original_question(rpc, before, root)

    def crash():
        nonlocal rpc
        root = rpc.send('@lead 강제 종료 검증')
        running = streaming(rpc, root)
        pending = rpc.send('@lead 강제 종료 직전 대기 요청')
        bot = running['messages'][-1]['id']
        assert host.logs().count('E2E_CRASH_REQUEST_STARTED') == 1
        host.stop(hard=True)
        rpc = Rpc(host.start())
        view = rpc.view()
        assert idle(view)
        statuses = {m['id']: m['status'] for m in view['messages']}
        assert statuses[root] == statuses[bot] == statuses[pending] == 'interrupted', statuses
        rows = rpc.settled(rpc.send('@lead 종료 후 새 요청'))
        assert rows[0]['status'] == rows[1]['status'] == 'complete', rows
        assert 'E2E_CRASH_REQUEST_STARTED' not in host.logs()
        return {'interrupted': 3, 'replayedActiveRequest': False, 'freshRequest': 'complete'}

    if record('REC-01', graceful):
        record('REC-02', crash)


def run_migration(host, previous, archive, record):
    def upgrade():
        host.install(previous)
        rpc = Rpc(host.start())
        rpc.save_room()
        root = rpc.send('@watch @test 그룹 인계 질문')
        before = rpc.wait(paused, '이전 플러그인 질문')
        assert before['awaiting']['remaining'] == 2
        checkpoint = next((host.home / 'storages' / 'team_chat' / 'rooms').glob('*.json'))
        stored = json.loads(checkpoint.read_text(encoding='utf-8'))
        assert stored['version'] == 3 and stored['record']['continuation']['steps'][1]['handoffFrom']
        host.stop()
        host.remove()
        host.install(archive)
        rpc = Rpc(host.start())
        assert_original_question(rpc.view(), before)
        answer_original_question(rpc, before, root)
        return {'oldSchema': stored['version'], 'preservedTeamSessions': len(before['members']), 'remainingTurns': 2}

    record('MIG-01', upgrade)
