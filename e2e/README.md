# DeepSeek Harness Team Chat E2E

대상은 `dsh-team-chat` 0.3.2와 DSH `0.2.2-rc.1`입니다. 격리된 Desktop 및 Web 프로필에 플러그인을 설치하고, 기존 Agent Team의 네이티브 리드와 팀원 세션을 사용합니다. 테스트 모델은 `fixture.mjs`에서 실행되며 API 키가 필요하지 않습니다.

Desktop에서 설치하려면 Plugins에서 Agent Teams를 활성화하고 Add plugin에 `packages/dsh-team-chat-0.3.2.tgz`의 절대 경로를 입력합니다. 이미 Team Chat을 설치한 프로필에서는 같은 플러그인을 업데이트합니다. CLI를 사용하려면 Desktop 앱을 완전히 종료한 뒤 Desktop과 함께 설치된 `dsh plugin --profile desktop add "/absolute/path/dsh-team-chat-0.3.2.tgz"`를 실행합니다.

| 파일 | 용도 |
|---|---|
| `cases.json` | 56개 케이스의 ID, 참고 제품, 절차와 기대 결과 |
| `browser_cases.py` | 실제 Chromium 화면, 네이티브 승인, 브라우저 두 탭 및 WebSocket 단절 |
| `host_cases.py` | 실제 RPC, 턴 격리, 권한, 대기열, 강제 종료, 구버전 업그레이드 |
| `allocation_cases.py` | 일반 채팅 배분안, 전체 승인, 개별·전체 중지, 체크포인트와 Agent별 결과 |
| `workflow_cases.py` | 채팅 설계, 그래프·계층 편집, 실제 작업 보드, 작업별 질문, 병렬·조건 분기, 재시작과 폴더 트리거 |
| `run.py`, `harness.py`, `fixture.mjs` | 실행기, 격리된 DSH 프로필, 재현 가능한 모델과 테스트 도구 |
| `desktop_cases.py` | 공식 Desktop CLI 및 Host 프로필, 기존 팀 실행, 업데이트·종료와 화면 검증 |
| `HARNESS-ADAPTER.md` | 다른 Harness를 연결하는 버전형 인터페이스와 실행 복구 경계 |
| `packages/` | 설치 대상 0.3.2, 비교판 0.2.2, 업그레이드 시작점 0.2.1·0.3.0·0.3.1 |
| `RESULTS.md`, `results.json` | 케이스별 실측 결과, 테스트 환경, 설치한 패키지의 SHA-256 |
| `baseline-ui.json` | 0.2.2에서 실행한 브라우저 회귀 결과 |

## 실행

Python 3.10 이상, Node.js 24.9 이상과 npm을 준비합니다. 압축을 풀어 이 디렉터리에서 실행합니다.

```bash
python -m pip install -r requirements.txt
python -m playwright install chromium
python run.py --results results.json
```

실행기는 임시 디렉터리에 고정 버전 DSH를 설치하고, 그룹마다 별도의 테스트용 `DSH_HOME`과 loopback 서버를 생성합니다. 테스트 팀과 메시지는 해당 프로필에만 생성됩니다. Chromium Linux 시스템 의존성이 빠진 환경에서는 Playwright의 `install --with-deps chromium`을 사용할 수 있습니다. 실제 실행 결과는 Linux Chromium 기준입니다.

`--runtime-dir /path/to/runtime`은 고정 DSH를 포함한 기존 `node_modules`의 상위 디렉터리를 받습니다. `--chromium /path/to/chromium`은 Chromium 실행 경로를 지정합니다. `--group UI HOST REC MIG WF WUI AL AUI AM AU DT`에 그룹을 골라 실행할 수 있습니다. 실패 조사 시 `--work-dir /path/to/new-directory`로 새 경로를 지정하면 테스트 프로필과 호스트 로그가 남습니다. 호스트 로그에는 해당 임시 서버의 인증 URL이 들어갑니다.

```bash
python run.py --group UI --package packages/dsh-team-chat-0.2.2.tgz --results baseline-ui.json
```

`PASS`는 모든 기대 동작이 관측됐음을, `FAIL`은 실행한 케이스가 기대와 달랐음을, `BLOCKED`는 선행 단계 실패로 실행하지 못했음을 뜻합니다. 실패나 미실행이 있으면 실행기는 0이 아닌 종료 코드를 반환합니다. JSON에는 케이스별 경과 시간과 일부 정량 증거를 기록합니다. 경과 시간에는 테스트 대기가 포함됩니다.

## 참고한 제품 동작

| 제품 | 테스트 설계에 반영한 관찰 기준 |
|---|---|
| Grok Bot | 멘션과 답장으로 수신자를 지정하고, 봇 인계와 도구 승인에 각자의 경계를 적용합니다. |
| Meta Muse | 진행 중인 작업의 상태와 입력 필요 여부가 드러나고, 다른 입력 및 실패가 함께 발생해도 결과가 추적됩니다. |
| Hermes Bot Mode | 기존 에이전트 프로필에 해당하는 봇을 재사용하고, 그룹 대화와 직접 메시지 및 대기열을 검증합니다. |

- [Grok Bot Chat and Collaboration](https://docs.x.ai/grok-bot/chat-and-collaboration)
- [Grok Bot Approvals, Security, and Privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy)
- [Meta Muse Product Design](https://introducing-muse.com/)
- [Meta Muse Security and Safety](https://muse.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse)
- [Hermes Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode)

참고 제품의 공개 문서는 테스트의 행동 기준으로 사용했습니다. 이 실행은 Team Chat만 대상으로 하며, 실모델 응답 품질, 모델 처리량, Windows/macOS 데스크톱 설치 동작은 별도 검증 범위입니다. 유휴 성능 케이스는 방의 watch가 활성화된 3초 동안 방 조회 HTTP 요청을 계수합니다.

워크플로우 설계 응답, 질문, 장비 작업 및 결과 파일 생성은 테스트 모델이 재현합니다. DSH의 실제 세션과 공유 작업 보드, 플러그인 상태 저장, Chromium UI를 사용합니다. 장비 점유는 테스트용 장비 ID로 검사합니다.


## 공식 Desktop Host 검증

`DT` 그룹은 Git 태그 `dsh-v0.2.2-rc.1`의 공식 Desktop Host 및 Desktop CLI 소스를 사용합니다. Desktop CLI의 `desktop` 프로필에 테스트 패키지를 설치하고, 격리된 DSH_HOME에서 Node 모드 자식 프로세스를 실행합니다. 해당 Host가 제공하는 UI를 Chromium에서 검증합니다. Windows/macOS 설치 파일과 네이티브 윈도 동작은 미검증입니다.

```bash
python run.py --group DT --desktop-source /path/to/deepseek-harness --desktop-pnpm /path/to/pnpm --results desktop-results.json
```

`--desktop-pnpm`은 `bin/pnpm.mjs`가 있는 로컬 pnpm 패키지 디렉터리입니다. `--desktop-source`를 전달하면 전체 실행에도 Desktop 그룹이 포함됩니다. 나머지 그룹은 Web 프로필에서 별도로 실행합니다. 모든 그룹은 테스트 모델과 합성 작업을 사용합니다.
