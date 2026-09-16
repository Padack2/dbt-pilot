# dbt Pilot

GitHub Public Events API 데이터를 dbt incremental 모델로 관리하고,
웹 대시보드와 LLM 챗봇으로 운영·분석하는 풀스택 데이터 파이프라인 프로젝트.

전체 기획은 [docs/plan.md](./docs/plan.md), DB 스키마 상세는 [docs/schema.md](./docs/schema.md) 참고.

## 구조

```
apps/web/          Next.js 대시보드 + API Routes (pnpm workspace)
pipeline/dbt/       dbt 프로젝트 (staging → precomputed_events(incremental) → MV 3종)
pipeline/ingest/    GitHub Events API 수집 스크립트 (Python)
pipeline/sql/       DB 스키마(raw_events)·롤 분리 SQL (admin이 최초 1회 직접 실행)
.github/workflows/  5분 주기 수집 + dbt run + MV refresh 워크플로우
```

MV 3종(`mv_daily_trend`, `mv_repo_ranking`, `mv_event_type_dist`)은 dbt-postgres의
`materialized_view` materialization으로 정의되어 있어 `manifest.json`의 의존성 그래프에
그대로 잡힌다. 다만 Postgres는 `dbt run`만으로 MV 데이터를 자동 refresh하지 않으므로,
`dbt run` 이후 `dbt run-operation refresh_materialized_views`로
`REFRESH MATERIALIZED VIEW CONCURRENTLY`를 별도로 트리거한다.

## DB 최초 셋업 (admin 권한, Neon SQL Editor)

이미 만들어진 Neon DB에 아래 두 스크립트를 순서대로 실행한다.

```bash
psql "$ADMIN_DATABASE_URL" -f pipeline/sql/schema.sql   # raw_events 테이블 + 인덱스
psql "$ADMIN_DATABASE_URL" -f pipeline/sql/roles.sql    # batch_user / readonly_user 롤 분리
```

`roles.sql`의 `CHANGE_ME` 비밀번호는 실행 전 실제 값으로 바꿀 것.

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
dbt run
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

`.env.example` 참고. Neon 접속 정보는 배치용/읽기전용 롤을 분리해서 발급한다
(`pipeline/sql/roles.sql`).

## GitHub Actions Secrets

`.github/workflows/ingest.yml`이 5분마다 수집 → dbt run → MV refresh를 실행한다.
리포지토리 Settings → Secrets에 아래 값을 등록해야 한다.

| Secret | 용도 |
|--------|------|
| `DATABASE_URL_BATCH` | 수집 스크립트 DB 접속 (배치 롤) |
| `PGHOST` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | dbt profiles.yml용 (배치 롤과 동일 계정) |
| `GH_EVENTS_TOKEN` | GitHub Events API rate limit 상향용 (선택) |
| `SLACK_WEBHOOK_URL` | 파이프라인 실패 알림 |
