## 메타

- **ADR ID**: ADR-015
- **상태**: 승인
- **날짜**: 2026-09-30
- **작성자**: 김아진
- **영향 범위**: `.github/workflows/collect.yml`(신규), `.github/workflows/ingest.yml`,
  `pipeline/ingest/collect.py`(신규), `pipeline/ingest/ingest.py`,
  `pipeline/observability/check_db.py`(신규), `apps/web/src/lib/mv-catalog.ts`,
  (외부) cron-job.org job 2개
- **태그**: 비용, pipeline, observability
- **관련 ADR**: ADR-002(알림 피로 방지), ADR-003(외부 cron 트리거), ADR-006/011(수동 REFRESH),
  ADR-013/014(저장 용량 — 이번 문제와는 별개 쿼터)

---

## 1) 배경 (Context)

- 2026-09-30, Neon DB 접속이 `Your account or project has exceeded the quota`(SQLSTATE 53000)로
  거부되기 시작했다. 읽기 전용 롤도 접속 자체가 안 됐다 — 저장 용량(0.5GB) 초과였다면 쓰기만
  막히고 읽기는 됐을 것이므로, ADR-013/014에서 다룬 스토리지가 아니라 **컴퓨트 쿼터** 초과다.
- Neon 무료 플랜: 프로젝트당 **월 100 CU-hours**, 컴퓨트는 5분간 쿼리가 없으면 scale-to-zero
  (무료 플랜에서는 이 시간을 바꿀 수 없음). 쿼터를 넘기면 다음 결제 주기까지 컴퓨트가 정지된다
  (데이터는 보존).
- 파이프라인이 **5분마다** DB에 접속하니 컴퓨트가 꺼질 틈이 없어 사실상 24시간 켜져 있었다.
  최소 사양(0.25 CU)이어도 월 744h × 0.25 = **~186 CU-h**로 한도의 약 2배 — 9/17 수집 시작 후
  월말에 소진된 것과 맞아떨어진다. 즉 **5분 주기 DB 접속 자체가 무료 플랜과 구조적으로 양립 불가**.
- 부수 문제: 쿼터 초과 동안 5분마다 워크플로우가 실패해 실행마다 GitHub 실패 알림 메일이 왔고,
  연속 실패 3회 배수마다 Slack 알림도 발송됐다(ADR-002). 코드로 복구할 수 없는 상태인데 알림만
  쌓였다.
- 목표: 결제 없이 다음 달부터 컴퓨트 쿼터 안에 머문다. 쿼터 초과 같은 "예상된 중단"에는 알림이
  쏟아지지 않게 한다. 수집량(5분마다 최대 300건 샘플)은 가능하면 유지한다.
- 비목표: 대시보드 실시간성(5분 신선도) 유지.

## 2) 고려한 선택지 (Options)

한 번 실행하면 컴퓨트는 실행 시간(2~3분) + scale-to-zero 대기(5분), 약 8분 동안 켜진다고 가정.

- 옵션 A: 파이프라인 전체 주기를 30분/1시간으로 늘린다
    - 장점: cron-job.org 설정만 바꾸면 끝(30분 ~50 CU-h, 1시간 ~25 CU-h)
    - 단점/리스크: `/events`는 호출당 최근 최대 300건만 주므로 수집 표본이 1/6~1/12로 줄어든다
- 옵션 B: 수집(5분)과 적재(1시간)를 분리하고, 그 사이를 GitHub Actions artifact로 버퍼링 (채택)
    - 장점: DB는 1시간에 한 번만 깨어나면서(~25–30 CU-h) 수집량은 지금과 같다. 레포가 public이라
      Actions 실행 시간·artifact 저장이 무료. 적재가 실패하거나 쿼터 초과로 건너뛰어도 artifact가
      보존 기간 동안 남아 다음 적재 때 들어가므로, 지금보다 데이터 유실에 강하다
    - 단점/리스크: 워크플로우·스크립트·cron job이 하나씩 늘어난다. 대시보드 신선도가 최대 1시간
      늦어진다. 5분 수집 실행은 DB에 기록하지 않으므로 수집 실패가 `pipeline_runs`/Slack에 잡히지
      않는다(DB 없이 GitHub API만 호출해 실패할 일 자체가 드묾)
- 옵션 C: 외부 저장소(S3/R2 등)를 버퍼로 사용
    - 장점: artifact API보다 범용적
    - 단점/리스크: 새 계정·자격증명 관리가 필요. 이 규모에서는 artifact로 충분
- 옵션 D: 유료 플랜 전환
    - 단점/리스크: ADR-013과 같은 이유(토이/포트폴리오 프로젝트)로 배제

## 3) 결정 (Decision)

- 최종 선택: 옵션 B.
  1. `collect.yml` + `collect.py`: 5분마다 `/events`를 수집해 JSONL로 저장하고
     `raw-events-<run_id>` artifact(7일 보존 = raw_events 보존 기간과 동일)로 업로드한다. DB 접속 없음.
  2. `ingest.yml` + `ingest.py`: 1시간마다 `raw-events-*` artifact를 전부 내려받아 raw_events에
     적재(`on conflict (event_id) do nothing`)하고, commit 뒤에 해당 artifact를 삭제한다. 이어서
     기존과 동일하게 dbt build → MV refresh → prune을 실행한다. artifact 조회/삭제는 워크플로우의
     `GITHUB_TOKEN`(`actions: write`)으로 하므로 PAT를 새로 늘리지 않는다.
  3. `check_db.py`: 적재 전에 접속을 시도해 쿼터 초과 메시지면 `::warning`만 남기고
     `available=false`로 이후 스텝을 모두 건너뛴다. 잡은 **성공**으로 끝나므로 실패 메일/Slack
     알림이 가지 않는다. 그 외 접속 오류는 진짜 장애라 그대로 실패시킨다.
  4. 수동 REFRESH(버튼/챗봇, ADR-006/011): 새 데이터는 적재 시점(1시간 주기)에만 들어오고 그때
     파이프라인이 이미 REFRESH까지 하므로, 적재 사이의 수동 REFRESH는 같은 결과를 다시 계산하는
     **데모 기능**이 된다. 기능은 유지하되 쿨다운을 5분 → **1시간**으로 늘려, 공개 페이지에서
     반복 클릭으로 컴퓨트 쿼터를 소모하는 경로를 막는다.
- 결정 이유(Trade-off): 쿼터를 태우는 건 "DB가 깨어 있는 시간"이지 수집 자체가 아니다. 두 단계를
  분리하면 옵션 A와 같은 쿼터 절감을 얻으면서 수집량 손실이 없다. 잃는 것은 신선도(5분 → 최대
  1시간)뿐인데, 이 프로젝트는 실시간 분석이 목적이 아니라서 감내 가능하다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 예상 컴퓨트 사용량 월 ~186 CU-h → ~25–30 CU-h(+ 대시보드/챗봇 조회분). 쿼터 초과
  시 알림 폭주가 사라지고, 그동안의 수집분도 7일 이내면 보존된다
- 부정적 영향/부채:
  - 대시보드 데이터가 최대 1시간 늦게 반영됨
  - 수동 REFRESH 쿨다운이 1시간이라 연속 시연이 어려움
  - 쿼터 초과로 건너뛴 실행은 `pipeline_runs`에 기록되지 않음(DB에 쓸 수 없으므로) — Actions
    실행 로그의 warning으로만 확인 가능
  - 적재 주기가 1시간이 되면서 `FAILURE_ALERT_THRESHOLD=3`(ADR-002)은 "연속 3시간 실패 후 알림"을
    뜻하게 됨
- 추후 작업(TODO):
  - Neon 콘솔에서 autoscaling 최대치를 0.25 CU로 고정(dbt build 중 스케일업으로 쿼터를 빨리
    태우는 것 방지)
  - 10월 한 달 실측 CU-hours 확인 후 적재 주기 재조정 검토
  - `FAILURE_ALERT_THRESHOLD`를 1~2로 낮출지 운영하면서 판단

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법:
  - `collect.yml` 수동 실행 → Actions 실행 화면에 `raw-events-<run_id>` artifact가 생기는지 확인
  - `ingest.yml` 수동 실행 → 로그의 `적재 완료: artifact N개, M건` 확인, artifact가 삭제됐는지 확인,
    `select started_at, status, rows_ingested from pipeline_runs order by started_at desc limit 5;`
  - 며칠 뒤 Neon 콘솔 Usage에서 일일 컴퓨트 사용량이 ~1 CU-h 안팎인지 확인
- 롤백 전략: cron-job.org에서 `collect.yml` job을 끄고 `ingest.yml` job을 5분 주기로 되돌린 뒤,
  이 ADR 이전 커밋의 `ingest.py`(직접 수집+적재)로 복구. artifact는 보존 기간이 지나면 자동 삭제됨
