# dsh-harness-plugin

## Team Chat for DeepSeek Harness Desktop

기존 DSH Agent Team을 대화방에서 사용합니다. 리드가 제안한 배분안을 검토하고, 담당 Agent를 바꾼 뒤 전체 승인합니다. 채팅에서 Agent별 상태와 결과를 확인하고, 작업 하나 또는 방 전체를 중지할 수 있습니다.

호환 대상은 **Team Chat 0.3.2 / DSH Desktop 코어 0.2.2-rc.1**입니다. [설치 안내](plugin/README.md)와 [Mac mini 검증 절차](MAC_MINI_CODEX_PROMPT.md)를 참고하세요.

### 워크플로우 흐름도

팀 채팅의 **워크플로우** 사이드바에서 작업 순서와 병렬 분기·합류를 화살표로 봅니다. 작업을 누르면 담당 Agent를 바꿀 수 있습니다. 화살표나 조건을 누르면 실행 조건(`성공 후`, `실패 시`, `종료 후`)을 바꾸거나 연결을 삭제할 수 있습니다. 새 연결은 시작 작업에서 **연결 추가**를 누른 뒤 다음 작업을 선택합니다. [워크플로우 사용법](plugin/README.md#워크플로우-사용법)

### 최신 소스로 설치 패키지 만들기

Node.js 24.9 이상에서 저장소를 내려받고 다음을 실행합니다.

```sh
cd plugin
npm install
npm run build
npm pack
```

Desktop **Plugins → Add plugin**에 생성된 `plugin/dsh-team-chat-0.3.2.tgz`의 절대 경로를 입력합니다. [`e2e/packages`의 0.3.2 패키지](e2e/packages/dsh-team-chat-0.3.2.tgz)는 기존 회귀 테스트에 쓰는 고정본입니다. 흐름도 UI를 사용하려면 위 명령으로 현재 소스를 패키징하세요.

| 경로 | 내용 |
|---|---|
| `plugin/` | 플러그인 소스, 클라이언트 번들, 단위 테스트 |
| `e2e/` | DSH 회귀 테스트, 공식 Desktop Host 테스트, 고정 설치·업그레이드 패키지 |
| [Harness 어댑터 계약](plugin/HARNESS-ADAPTER.md) | 버전형 인터페이스, 필수 기능과 선택 기능, 복구 조건 |
| [기존 검증 기록](e2e/RESULTS.md) | 고정 패키지의 E2E 56건, 단위 테스트 45건 및 검증 환경 |

흐름도 빌드로 단위 테스트 45건과 E2E 56건을 통과했습니다. 별도로 설치된 macOS Desktop의 격리 프로필에서 합성 Agent를 사용해 담당자와 연결 조건 편집, 버전 저장, 재열기를 확인했습니다.
