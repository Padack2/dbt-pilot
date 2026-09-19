# dbt Pilot

GitHub Public Events API 데이터를 dbt incremental 모델로 관리하고,
웹 대시보드와 LLM 챗봇으로 운영·분석하는 풀스택 데이터 파이프라인 프로젝트입니다.

전체 기획은 [docs/plan.md](./docs/plan.md), DB 스키마 상세는 [docs/schema.md](./docs/schema.md)를 참고해 주세요.

## 배경 및 한계

GitHub Events API는 전체 이벤트를 다 내려주지 않고, 이 프로젝트는 그마저도 5분 주기로만
폴링하기 때문에 대시보드에 나오는 트렌드/랭킹 수치는 실제 GitHub 활동을 정확히 반영하지
못합니다(레포 하나당 관측되는 이벤트가 대부분 0~1건 수준입니다). 그래서 "정확한 트렌드 분석
도구"가 아니라, **dbt incremental 모델 + Materialized View + 운영 대시보드를 처음부터
끝까지 직접 구현해보는 것 자체가 목적인 학습/포트폴리오 프로젝트**입니다. 데이터 정확도보다
파이프라인 설계(증분 처리, 테스트 게이팅, 실행 이력 추적, MV refresh 트리거 등)에 더 무게를
두었습니다.

## 구조

```
apps/web/          Next.js 대시보드 + API Routes (pnpm workspace)
pipeline/dbt/       dbt 프로젝트 (staging → precomputed_events(incremental) → MV 3종)
pipeline/ingest/    GitHub Events API 수집 스크립트 (Python)
pipeline/sql/           DB 스키마(raw_events, pipeline_runs)·롤 분리 SQL (admin이 최초 1회 직접 실행)
pipeline/observability/ 파이프라인 실행 이력 기록 + 연속 실패 시 Slack 알림
.github/workflows/      5분 주기 수집 + dbt build + MV refresh 워크플로우, 8시간마다 급상승 레포 스냅샷 워크플로우
```

MV 3종(`mv_daily_trend`, `mv_repo_ranking`, `mv_event_type_dist`)은 dbt-postgres의
`materialized_view` materialization으로 정의되어 있어 `manifest.json`의 의존성 그래프에
그대로 잡힙니다. 다만 Postgres는 `dbt run`만으로 MV 데이터를 자동 refresh하지 않으므로,
`dbt build` 이후 `dbt run-operation refresh_materialized_views`로
`REFRESH MATERIALIZED VIEW CONCURRENTLY`를 별도로 트리거합니다.

### 워크플로우 설계 포인트

- **중복 실행 방지**: `concurrency` 그룹으로 이전 실행이 5분을 넘기면 다음 트리거를 큐잉합니다 (incremental 상태 꼬임 방지)
- **테스트 게이팅**: `dbt run` 대신 `dbt build`를 사용해 모델 실행과 동시에 `not_null`/`unique` 테스트를 의존성 순서대로 검증합니다 — 실패 시 하위 MV까지 전파되지 않습니다
- **실행 이력**: 매 실행마다 성공/실패, 처리 row 수, 에러 메시지를 `pipeline_runs` 테이블에 기록합니다. 대시보드가 GitHub Actions API 없이 DB만으로 "모델 상태/마지막 실행 시각"을 보여줄 수 있습니다
- **알림 피로 방지**: 5분 주기 배치라 일시적 오류로도 실패가 잦을 수 있어, 매 실패마다 알리지 않고 연속 실패가 `FAILURE_ALERT_THRESHOLD`(기본 3)의 배수에 도달했을 때만 Slack으로 알립니다

## DB 최초 셋업 (admin 권한, Neon SQL Editor)

이미 만들어진 Neon DB에 아래 스크립트를 순서대로 실행합니다.

```bash
psql "$ADMIN_DATABASE_URL" -f pipeline/sql/schema.sql          # raw_events 컬럼/인덱스 보강 (ALTER)
psql "$ADMIN_DATABASE_URL" -f pipeline/sql/roles.sql           # batch_user / readonly_user 롤 분리
psql "$ADMIN_DATABASE_URL" -f pipeline/sql/pipeline_runs.sql   # 파이프라인 실행 이력 테이블 (신규)
psql "$ADMIN_DATABASE_URL" -f pipeline/sql/mv_refresh_log.sql  # MV별 refresh 시각 기록 테이블 (신규)
psql "$ADMIN_DATABASE_URL" -f pipeline/sql/trending_repos_snapshot.sql  # 급상승 레포 스냅샷 테이블 (신규)
```

`roles.sql`의 `CHANGE_ME` 비밀번호는 실행 전 실제 값으로 바꿔 주세요.

## 로컬 개발 준비

### 1. 웹 (apps/web)

```bash
pnpm install
pnpm dev
```

### 2. dbt

```bash
cd pipeline/dbt
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp profiles.yml.example ~/.dbt/profiles.yml
# PGHOST / PGUSER / PGPASSWORD / PGDATABASE 환경변수 설정 (batch_user 계정) 후
dbt build
dbt run-operation refresh_materialized_views
```

### 3. 수집 스크립트

```bash
cd pipeline/ingest
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# DATABASE_URL_BATCH, GITHUB_TOKEN 환경변수 설정 후
python ingest.py
```

## 환경변수

`.env.example`을 참고해 주세요. Neon 접속 정보는 배치용/읽기전용 롤을 분리해서 발급합니다
(`pipeline/sql/roles.sql`).

## 웹 대시보드 배포 (Vercel)

`apps/web`은 pnpm workspace 안의 패키지 하나라, Vercel 프로젝트 생성 시 아래처럼 설정합니다.

1. Vercel 대시보드 → Add New → Project → 이 GitHub 레포(`dbt-pilot`) Import
2. **Root Directory**를 `apps/web`으로 지정합니다 (Framework Preset은 Next.js가 자동 감지됩니다).
   Root Directory를 지정해도 git 저장소 전체가 클론되고, 설치도 리포 루트의
   `pnpm-lock.yaml`/`pnpm-workspace.yaml` 기준으로 동작합니다 (Vercel의 pnpm workspace 지원)
3. **Environment Variables**에 아래 값을 등록합니다 (`apps/web/.env.local`과 동일한 값)

   | 변수 | 비고 |
   |---|---|
   | `DATABASE_URL_READONLY` | 조회 전용 |
   | `DATABASE_URL_BATCH` | 수동 REFRESH 버튼(Server Action) 전용, ADR-006 참고 |
   | `GEMINI_API_KEY` | 우측 하단 운영 어시스턴트 챗봇(Drawer) 전용, ADR-009 참고 |

4. Deploy

### 배포 시 주의할 점 (로컬에서 직접 검증한 내용)

- `/models`의 모델 의존성 그래프(`lib/model-graph.ts`)는 `pipeline/dbt/models`의 SQL 파일을
  런타임에 직접 읽습니다. Vercel 서버리스 함수의 파일 트레이싱은 import로 연결되지 않은
  파일을 자동으로 포함하지 않기 때문에, `apps/web/next.config.mjs`의
  `outputFileTracingIncludes`에 명시해두었습니다 (ADR-007). Root Directory를 `apps/web`으로
  잡아도 `../../pipeline/dbt/models` 상대 경로는 그대로 유효하며, `pnpm build` 후
  `.next/server/app/models/page.js.nft.json`에 해당 SQL 파일들이 실제로 포함되는지
  확인했습니다
- REFRESH 진행 상황 표시(`lib/refresh-progress.ts`)는 프로세스 인메모리 상태라, 서버리스
  인스턴스가 여러 개 뜨면 REFRESH를 실행 중인 인스턴스와 폴링 요청이 도착한 인스턴스가 달라
  "진행 중" 표시가 안 보일 수 있습니다(최종 완료/실패 배너는 리다이렉트라 항상 정확합니다).
  ADR-008을 참고해 주세요
- DB 접속 문자열이 이미 Neon pooler 엔드포인트(`-pooler`)라 서버리스의 짧고 잦은 커넥션
  패턴에도 별도 조치 없이 동작합니다

## GitHub Actions Secrets

`.github/workflows/ingest.yml`이 (외부 cron이 트리거할 때마다) 수집 → dbt build → MV refresh를
실행합니다. 리포지토리 Settings → Secrets에 아래 값을 등록해야 합니다.

| Secret | 용도 |
|--------|------|
| `DATABASE_URL_BATCH` | 수집/실행이력 기록 스크립트 DB 접속 (배치 롤) |
| `PGHOST` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | dbt profiles.yml용 (배치 롤과 동일 계정) |
| `GH_EVENTS_TOKEN` | GitHub Events API rate limit 상향용 (선택) |
| `SLACK_WEBHOOK_URL` | 연속 실패 시 파이프라인 알림 |

## 파이프라인 트리거 (cron-job.org)

GitHub Actions의 `schedule` 이벤트는 고부하 시간대에 수 시간까지 지연/드롭될 수 있어(ADR-003
참고), 실행 로직은 그대로 두고 트리거만 외부 무료 cron 서비스가 `workflow_dispatch`를
호출하는 방식으로 대체했습니다.

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens에서
   토큰을 발급합니다
   - Repository access: 이 레포(`dbt-pilot`)만 선택
   - Permissions: **Actions = Read and write**만 체크, 그 외 전부 No access
   - Expiration: 90일 권장 (만료 시 재발급 + 아래 3번 갱신)
2. [cron-job.org](https://cron-job.org)에서 무료 계정 생성 후 Create cronjob
   - URL: `https://api.github.com/repos/<owner>/dbt-pilot/actions/workflows/ingest.yml/dispatches`
   - Method: `POST`
   - Headers: `Authorization: Bearer <1번에서 발급한 토큰>`, `Accept: application/vnd.github+json`
   - Body(JSON): `{"ref": "main"}`
   - Schedule: every 5 minutes
3. 저장 후 cron-job.org의 Test run으로 1회 확인하고, 이후
   `select started_at, status from pipeline_runs order by started_at desc limit 20;`로
   5분 간격 기록이 쌓이는지 확인합니다

## 급상승 레포 감지 (ADR-004)

GitHub REST API에는 공식 trending 엔드포인트가 없어서, Search API(`created:>N일전` +
`sort=stars`)로 "최근 생성되고 스타가 많은 레포"를 근사치로 8시간마다 수집합니다. `/events` 기반
5분 주기 샘플은 레포 하나당 이벤트가 거의 없어(대부분 0~1건) 인기 랭킹으로 쓰기엔 신호가
너무 약했던 문제를 보완합니다.

1. 위 "파이프라인 트리거" 1번에서 발급한 PAT를 그대로 사용해 cron-job.org에 job 하나 추가
   - URL: `https://api.github.com/repos/<owner>/dbt-pilot/actions/workflows/trending.yml/dispatches`
   - Method/Headers/Body: 기존 job과 동일 (`{"ref": "main"}`)
   - Schedule: 8시간마다 (예: 매일 00:10, 08:10, 16:10 UTC)
2. 저장 후 Test run으로 1회 확인하고, 이후
   `select count(*) from trending_repos_snapshot;`로 적재를 확인합니다
3. 다음 `ingest.yml` 실행(5분 주기) 때 `dbt build`가 `trending_repos_with_activity` 뷰를
   함께 갱신하므로, 이후
   `select * from trending_repos_with_activity order by stars desc limit 10;`로
   급상승 레포와 우리 샘플에서 관측된 활동(`observed_events`)을 함께 확인할 수 있습니다
