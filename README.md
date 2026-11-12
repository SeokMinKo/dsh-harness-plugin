# dsh-harness-plugin

## Team Chat for DeepSeek Harness Desktop

기존 DSH Agent Team을 대화방에서 사용합니다. 리드가 제안한 배분안을 검토하고, 담당 Agent를 바꾼 뒤 전체 승인합니다. 채팅에서 Agent별 상태와 결과를 확인하고, 작업 하나 또는 방 전체를 중지할 수 있습니다.

현재 검증 대상은 **Team Chat 0.3.2 / DSH Desktop 코어 0.2.2-rc.1**입니다. [설치 안내](plugin/README.md), [설치 패키지](e2e/packages/dsh-team-chat-0.3.2.tgz), [Mac mini Codex 프롬프트](MAC_MINI_CODEX_PROMPT.md)를 참고하세요.

| 경로 | 내용 |
|---|---|
| `plugin/` | 플러그인 소스, 클라이언트 번들, 단위 테스트 |
| `e2e/` | DSH 회귀 테스트, 공식 Desktop Host 테스트, 고정 설치·업그레이드 패키지 |
| [Harness 어댑터 계약](plugin/HARNESS-ADAPTER.md) | 버전형 인터페이스, 필수 기능과 선택 기능, 복구 조건 |
| [검증 결과](e2e/RESULTS.md) | E2E 56건, 단위 테스트 45건 및 검증 환경 |

공식 Desktop Host 테스트는 Linux에서 실행했습니다. 실제 macOS Electron 앱의 설치와 네이티브 동작은 Mac mini 검증 항목입니다.
