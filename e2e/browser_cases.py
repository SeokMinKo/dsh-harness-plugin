"""Chromium journeys through the installed Team Chat panel and native DSH UI."""

import os
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright

def dismiss_preview_notice(page):
    notice = page.get_by_text('Preview Notice', exact=True)
    page.add_locator_handler(notice, lambda: page.get_by_role('button', name='Continue', exact=True).click())


def run_browser(host, archive, record, chromium):
    host.install(archive)
    address = host.start()
    base = address.split('?', 1)[0]
    with sync_playwright() as playwright:
        arguments = ['--disable-dev-shm-usage', '--no-proxy-server']
        if os.environ.get('TEAM_CHAT_CHROMIUM_SINGLE_PROCESS') == '1':
            arguments += ['--single-process', '--no-zygote', '--disable-gpu', '--no-sandbox']
        browser = playwright.chromium.launch(executable_path=chromium, headless=True, args=arguments)
        context = browser.new_context(viewport={'width': 1280, 'height': 830}, locale='en-US')
        context.set_default_timeout(12_000)
        page = context.new_page()
        dismiss_preview_notice(page)
        calls, frames_sent, sockets, page_errors = [], [], [], []
        second_tab = None

        def watch_request(request):
            if '/api/teamChat/request' not in request.url:
                return
            try:
                operation = request.post_data_json['payload']['args']['input']['op']
                calls.append((operation, time.monotonic()))
            except (ValueError, KeyError, TypeError):
                return

        def proxy(socket):
            server = socket.connect_to_server()
            sockets.append((socket, server))

            def forward(frame):
                frames_sent.append(frame)
                server.send(frame)

            socket.on_message(forward)

        def open_app(tab, url):
            tab.goto(url, wait_until='domcontentloaded')
            tab.get_by_role('button', name='Team Chat', exact=True).click(timeout=25_000)

        def send(text, tab=page):
            tab.get_by_role('textbox', name='메시지').fill(text)
            tab.get_by_role('button', name='보내기', exact=True).click()

        composer = page.get_by_role('textbox', name='메시지')

        def bodies():
            return page.locator('.tc-message.tc-bot .tc-body').all_text_contents()

        def team_chat_button():
            return page.get_by_role('button', name='이 팀의 대화방 열기')

        def setup():
            page.route_web_socket('**/api/remote.mux*', proxy)
            page.on('request', watch_request)
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            open_app(page, address)
            page.locator('.tc-room-link').filter(has_text='검증 팀').click()
            page.get_by_role('heading', name='팀 대화방 만들기').wait_for()
            assert page.locator('.tc-config input[type=checkbox]:checked').count() == 4
            page.get_by_label('방 이름').fill('Team Chat E2E')
            page.get_by_role('button', name='저장', exact=True).click()
            composer.wait_for()
            for name in ('lead', 'watch', 'test', 'report'):
                assert page.locator('.tc-members').get_by_role('button', name='@' + name, exact=True).count() == 1
            page.get_by_role('button', name='팀 세션').click()
            team_chat_button().click()
            page.get_by_role('heading', name='Team Chat E2E').wait_for()
            composer.wait_for()
            return 'Chromium ' + browser.version + ' · 실제 플러그인 패널 · 기존 팀원 4명'

        def mention():
            composer.fill('봐줘 @wa 지금')
            composer.evaluate('(field) => field.setSelectionRange(6, 6)')
            composer.press('t')
            page.get_by_role('option', name='@watch', exact=True).wait_for()
            composer.press('Tab')
            assert composer.input_value() == '봐줘 @watch 지금'
            assert page.locator('.tc-message').count() == 0

        def address_and_reply():
            send('@all 전원 확인')
            page.get_by_text('report 전체 확인', exact=True).wait_for()
            assert bodies() == [name + ' 전체 확인' for name in ('lead', 'watch', 'test', 'report')]
            page.locator('.tc-message').filter(has_text='test 전체 확인').get_by_role('button', name='답장', exact=True).click()
            send('답장 단일 확인')
            page.get_by_text('test 답장 확인', exact=True).wait_for()
            assert bodies()[-1:] == ['test 답장 확인']
            assert len(bodies()) == 5

        def question_priority():
            send('@watch @test 그룹 인계 질문')
            page.get_by_text('남은 팀원 작업 2건', exact=False).wait_for()
            send('@lead 먼저 보낸 별도 요청')
            page.get_by_text('대기열 1건', exact=True).wait_for()
            assert '리드 확인 완료' not in bodies()
            page.get_by_role('button', name='답변하기').click()
            send('조건 확정 42')
            page.get_by_text('리드 확인 완료', exact=True).wait_for()
            page.get_by_role('button', name='답변하기').wait_for(state='hidden')
            assert bodies()[-4:] == ['watch 답변: 확정 조건 42', 'test 검증: 확정 조건 42 확인',
                'report 요약: 조건 42 검증 완료', '리드 확인 완료']

        def stop_current():
            composer.fill('@lead 중지 테스트')
            page.get_by_label('이번 메시지에 DSH 도구 허용').check()
            send('@lead 중지 테스트')
            page.get_by_text('작업 중입니다.', exact=True).wait_for()
            send('@lead 중지 후 이어갈 요청')
            page.get_by_text('대기열 1건', exact=True).wait_for()
            page.get_by_role('button', name='현재 응답만 중지').click()
            page.get_by_text('중지됨', exact=True).nth(1).wait_for()
            page.get_by_text('리드 확인 완료', exact=True).nth(1).wait_for()
            assert page.get_by_text('중지됨', exact=True).count() == 2

        def drafts_and_search():
            page.locator('.tc-user').filter(has_text='@lead 중지 테스트').get_by_role('button', name='다시 작성').click()
            assert composer.input_value() == '@lead 중지 테스트'
            assert not page.get_by_label('이번 메시지에 DSH 도구 허용').is_checked()
            page.get_by_role('button', name='팀 세션').click()
            team_chat_button().click()
            composer.wait_for()
            assert composer.input_value() == '@lead 중지 테스트'
            page.get_by_role('button', name='기록 검색').click()
            page.get_by_role('searchbox', name='불러온 기록 검색').fill('중지 테스트')
            page.get_by_text('불러온 메시지 중 1건').wait_for()
            page.get_by_role('button', name='기록 검색').click()
            composer.fill('')

        def native_approval():
            composer.fill('@all 도구 승인 테스트')
            page.get_by_label('이번 메시지에 DSH 도구 허용').check()
            assert not page.get_by_role('button', name='보내기', exact=True).is_enabled()
            send('@lead 도구 승인 테스트')
            page.locator('.tc-activity').get_by_text('DSH 승인 대기', exact=False).wait_for()
            page.get_by_role('button', name='원본 세션 열기', exact=True).click()
            page.get_by_role('button', name='Reject', exact=True).click()
            team_chat_button().click()
            page.locator('.tc-bot').get_by_text('도구 결과:', exact=False).filter(has_text='rejected').wait_for()

        def blocked_handoff():
            send('@lead 미등록 인계')
            page.get_by_text('@missing · 방에 없는 팀원', exact=True).wait_for()
            page.get_by_text('일부 실패', exact=True).wait_for()

        def two_tabs():
            nonlocal second_tab
            second_tab = context.new_page()
            dismiss_preview_notice(second_tab)
            open_app(second_tab, base)
            second_tab.get_by_role('textbox', name='메시지').wait_for()
            send('@lead 두 창 검증')
            for tab in (page, second_tab):
                tab.get_by_text('두 창 동기화 응답', exact=True).wait_for()
                assert tab.get_by_text('두 창 동기화 응답', exact=True).count() == 1
            page.set_viewport_size({'width': 700, 'height': 830})
            if page.locator('.tc-room-link').first.is_visible():
                page.locator('.tc-room-link').first.click()
            composer.wait_for()
            page.get_by_role('button', name='대화방', exact=True).click()
            page.locator('.tc-room-link').first.click()
            composer.wait_for()
            page.set_viewport_size({'width': 1280, 'height': 830})

        def count_watches():
            return sum('teamChat/watch' in str(frame) for frame in frames_sent)

        def idle_stream():
            assert count_watches() > 0 and sockets
            assert {'save', 'send'}.issubset({op for op, _ in calls}), 'HTTP 관측기가 정상 요청을 확인하지 못했습니다.'
            since = time.monotonic()
            page.wait_for_timeout(3000)
            samples = [op for op, moment in calls if moment >= since]
            assert samples.count('view') == 0, samples
            return {'windowSeconds': 3, 'httpViewCalls': 0, 'observedWatchOpens': count_watches()}

        def reconnect_with_message(message, response):
            assert second_tab is not None and sockets
            previous = count_watches()
            page_side, _ = sockets[-1]
            page_side.close(code=1012, reason='E2E reconnect')
            send(message, second_tab)
            second_tab.get_by_text(response, exact=True).wait_for()
            deadline = time.monotonic() + 10
            while count_watches() <= previous and time.monotonic() < deadline:
                page.wait_for_timeout(75)
            assert count_watches() > previous and len(sockets) >= 2
            assert not page_errors, page_errors
            return {'watchOpensBefore': previous, 'watchOpensAfter': count_watches()}

        def reconnect():
            evidence = reconnect_with_message('@lead 재연결 검증', '재연결 동기화 응답')
            result = page.get_by_text('재연결 동기화 응답', exact=True)
            result.wait_for()
            assert result.count() == 1
            return evidence

        def reconnect_history():
            open_app(page, base)
            first = page.get_by_text('@all 전원 확인', exact=True)
            page.get_by_role('button', name='이전 메시지 보기').wait_for()
            assert first.count() == 0, '이전 페이지 없이도 최초 메시지가 표시됐습니다.'
            page.get_by_role('button', name='이전 메시지 보기').click()
            first.wait_for()
            page.get_by_role('button', name='기록 검색').click()
            search = page.get_by_role('searchbox', name='불러온 기록 검색')
            search.fill('@all 전원 확인')
            page.get_by_text('불러온 메시지 중 1건', exact=True).wait_for()
            evidence = reconnect_with_message('@lead 기록 재연결 검증', '기록 재연결 동기화 응답')
            assert search.input_value() == '@all 전원 확인'
            try:
                page.get_by_text('불러온 메시지 중 1건', exact=True).wait_for(timeout=3500)
            except PlaywrightTimeout as error:
                raise AssertionError('재연결 뒤 검색 표시 · ' + page.locator('.tc-search-count').inner_text()) from error
            assert first.count() == 1, '재연결 뒤 이전에 불러온 메시지가 사라졌습니다.'
            page.get_by_role('button', name='기록 검색').click()
            page.get_by_text('기록 재연결 동기화 응답', exact=True).wait_for()
            return {**evidence, 'previousSearchMatches': 1, 'recoveredNewMessage': True}

        cases = [setup, mention, address_and_reply, question_priority, stop_current, drafts_and_search,
            native_approval, blocked_handoff, two_tabs, idle_stream, reconnect, reconnect_history]
        for index, case in enumerate(cases, start=1):
            if not record(f'UI-{index:02}', case):
                page.screenshot(path=str(host.workdir / 'browser-error.png'))
                print('대화상자:', page.get_by_role('dialog').all_text_contents(), '페이지 오류:', page_errors, flush=True)
                # Browser journeys intentionally share a room and a sequence of UI actions.
                # An unexpected result blocks later journeys rather than manufacturing a pass.
                break
        browser.close()
