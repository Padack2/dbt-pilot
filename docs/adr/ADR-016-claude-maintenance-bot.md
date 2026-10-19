## 메타

- **ADR ID**: ADR-016
- **상태**: 승인
- **날짜**: 2026-10-19
- **작성자**: 김아진
- **영향 범위**: `.github/workflows/maintenance-triage.yml`(신규), `.github/workflows/maintenance-monthly.yml`(신규),
  `README.md`, (Secret) `CLAUDE_CODE_OAUTH_TOKEN`
- **태그**: 유지보수, observability, github-actions, 비용
- **관련 ADR**: ADR-002(알림 피로 방지), ADR-003(외부 cron 트리거·PAT 만료), ADR-015(수집/적재 분리)
- **링크**: https://github.com/anthropics/claude-code-action

---

## 1) 배경 (Context)

- 2026-10-19 새벽부터 `collect.yml`이 간헐적으로 실패했다. 원인은 GitHub `/events` API의 일시적
  502였고(`collect.py`가 5xx를 처리하지 않아 실행 전체가 실패), 실패 메일은 왔지만 로그를 직접 열어
  보기 전까지 원인을 알 수 없었다.
- 이 프로젝트는 곧 방치될 예정이다(다른 토이 프로젝트로 이동). 방치 상태에서 생길 문제는 대부분
  - 외부 원인: GitHub/Neon 장애, 쿼터 초과, **cron-job.org PAT 만료(90일, ADR-003)**
  - 노후화: deprecated 액션(Node 20), 러너 이미지 변경(`ubuntu-latest` → Ubuntu 26), 의존성 지원 종료
- 제약: 추가 비용 없음. 작성자는 Claude Pro 구독 중.
- 목표: 실패 원인 진단과 노후화 점검을 사람 대신 해서 이슈/PR로 남긴다.
- 비목표: 사람 개입 없는 완전 자동 수정·배포. 실패 알림 자체(이미 GitHub 실패 메일로 받고 있음).

## 2) 고려한 선택지 (Options)

- 옵션 A: 완전 자동 유지보수(실패하면 LLM이 고쳐서 main에 바로 반영)
    - 장점: 사람이 전혀 안 봐도 됨
    - 단점/리스크: 실패의 대부분이 코드로 못 고치는 외부 원인이라 불필요한 변경만 쌓인다. 쓰기 권한을
      가진 봇이 아무도 안 보는 레포의 main을 바꾸는 구조
- 옵션 B: LLM이 진단 + 이슈 작성 + (고칠 수 있으면) PR까지, 머지는 사람이 (채택)
    - 장점: 원인 파악 비용이 사라지고, 잘못된 수정은 머지 전에 걸러진다
    - 단점/리스크: 사람이 언젠가는 이슈/PR을 봐야 한다
- LLM 선택: Claude Code Action vs Gemini CLI Action(챗봇이 이미 Gemini 사용, ADR-012)
    - Claude Code Action은 Pro 구독 OAuth 토큰(`claude setup-token`)으로 추가 과금 없이 쓸 수 있고,
      코드 수정·PR 작성이 주 용도인 도구라 이쪽을 택했다

## 3) 결정 (Decision)

- 최종 선택: 옵션 B, `anthropics/claude-code-action@v1` + `CLAUDE_CODE_OAUTH_TOKEN`(Pro 구독).
  1. `maintenance-triage.yml`: 파이프라인 워크플로우 3개가 끝날 때(`workflow_run`) 깨어나서,
     **같은 워크플로우의 최근 완료 실행 3회가 모두 실패**했고 **열린 `maintenance-bot` 이슈가 없을 때만**
     Claude를 실행한다. Claude는 실패 로그를 읽어 원인을 분류하고 이슈를 만들며, 코드로 고칠 수 있으면
     `claude/` 브랜치에 PR을 연다.
  2. `maintenance-monthly.yml`: 매월 1일 Claude가 파이프라인 가동 여부, 실행 경고(deprecation 등),
     액션/Python/의존성 노후화를 점검해 필요할 때만 이슈/PR을 만든다.
- 결정 이유(Trade-off):
  - 임계값 3은 ADR-002와 같다. 이번 502처럼 성공·실패가 섞이는 일시 장애에는 봇이 깨지 않고,
    열린 이슈가 있으면 다시 깨지 않아 Pro 사용 한도를 아낀다. 모델은 sonnet, 턴 수는 20/30으로 묶었다.
  - 월간 점검만 cron-job.org가 아닌 GitHub `schedule`을 쓴다. cron-job.org PAT가 만료되면 파이프라인이
    통째로 멈추고 실패도 없으니 triage 봇은 깨어나지 않는다 — 이걸 잡으려면 같은 PAT에 의존하면 안 된다.
    월 1회라 `schedule`의 수 시간 지연(ADR-003)은 문제 되지 않는다.
  - GitHub App 설치 없이 워크플로우의 `GITHUB_TOKEN`을 쓴다. 대신 `GITHUB_TOKEN`은
    `.github/workflows/` 파일을 push할 수 없으므로, 워크플로우 수정은 이슈에 제안 diff로 남긴다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 연속 실패 시 원인 분석이 이슈로 남고, 트리거 중단·노후화를 월 1회 점검한다. 추가 비용 없음
- 부정적 영향/부채:
  - Pro 사용 한도를 claude.ai/로컬 Claude Code와 공유한다(실패 진단 1회 대략 입력 5만~15만 토큰, 월간 점검 10만~30만 토큰 추정)
  - `CLAUDE_CODE_OAUTH_TOKEN`도 만료(약 1년)되고, Pro 구독을 해지하면 봇이 멈춘다 — 이때 봇 워크플로우가 실패해 실패 메일이 온다
  - 트리거 중단 감지는 월 1회라 최대 한 달 늦다
  - public 레포에서 60일간 활동이 없으면 GitHub가 `schedule` 워크플로우를 비활성화한다 — 월간 점검도 그때 멈춘다
  - main 직접 push 금지는 프롬프트와 `--allowedTools`(`git push origin claude/*`)로만 막는다
- 추후 작업(TODO):
  - 봇이 만든 첫 이슈/PR 품질을 보고 프롬프트 조정
  - 필요하면 main 브랜치 보호 규칙 추가

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법:
  - `maintenance-monthly.yml`을 수동 실행(workflow_dispatch) → 이슈/PR이 만들어지거나 "발견 없음"으로 끝나는지 확인
  - triage는 연속 3회 실패가 실제로 나야 동작한다. 그 전에는 실패 직후 실행된 triage의 `Check failure streak`
    스텝 로그(`연속 실패 n/3, 열린 봇 이슈 n건`)로 게이트가 도는지 확인
- 롤백 전략: 두 워크플로우 파일을 삭제(또는 Actions 화면에서 Disable)하고 `CLAUDE_CODE_OAUTH_TOKEN` 시크릿 제거.
  파이프라인 워크플로우는 건드리지 않았으므로 영향 없음
