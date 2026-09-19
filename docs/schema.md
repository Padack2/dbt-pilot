# DB 스키마 정의서

- 프로젝트: dbt-pilot
- DB: Neon PostgreSQL
- 스키마: public
- 최종 수정: 2026-09-19

---

## 1. 테이블

### raw_events

GitHub Public Events API (`GET /events`)에서 수집한 원본 이벤트 데이터를 적재하는 테이블.
5분 주기 GitHub Actions 배치가 INSERT하며, `event_id` 기준 중복 적재 방지.
저장 용량 관리를 위해 `created_at` 기준 **7일**이 지난 행은 매 파이프라인 실행마다 자동
삭제된다(`prune_raw_events` 매크로, ADR-013). `precomputed_events`의 incremental 워터마크는
이 테이블이 아닌 자기 자신 기준이라 평소 실행에는 영향 없음 — `dbt build --full-refresh` 시
7일 이전 구간만 재구성 불가.

| # | 컬럼명 | 데이터 타입 | NULL | 기본값 | 설명 |
|---|--------|------------|------|--------|------|
| 1 | event_id | TEXT | NOT NULL | — | GitHub 이벤트 고유 ID (PK) |
| 2 | type | TEXT | NOT NULL | — | 이벤트 타입 (WatchEvent, ForkEvent, PushEvent 등) |
| 3 | actor_login | TEXT | NOT NULL | — | 이벤트를 발생시킨 GitHub 유저명 |
| 4 | actor_id | BIGINT | NULL | — | GitHub 유저 내부 ID |
| 5 | repo_name | TEXT | NOT NULL | — | 이벤트가 발생한 리포지터리명 (owner/repo 형태) |
| 6 | repo_id | BIGINT | NULL | — | GitHub 리포 내부 ID |
| 7 | payload | JSONB | NULL | — | (미사용, 항상 NULL) 과거엔 이벤트 상세 데이터를 저장했으나 row 크기의 93%를 차지하면서 어디서도 조회되지 않아 ADR-014로 저장 중단. 컬럼은 스키마 호환을 위해 유지 |
| 8 | public | BOOLEAN | NULL | true | 공개 이벤트 여부 |
| 9 | created_at | TIMESTAMPTZ | NOT NULL | — | 이벤트 발생 시각 (UTC) |

**인덱스**

| 인덱스명 | 대상 컬럼 | 종류 | 용도 |
|---------|----------|------|------|
| raw_events_pkey | event_id | UNIQUE | PK, 중복 방지 |
| idx_raw_events_created_at | created_at DESC | BTREE | dbt incremental 기준 컬럼, 최신 데이터 조회 |
| idx_raw_events_type | type | BTREE | 이벤트 타입별 필터링 |
| idx_raw_events_repo_name | repo_name | BTREE | 리포별 필터링 |

---

## 2. Materialized View

모든 MV는 `precomputed_events`를 기반으로 생성되며,
`REFRESH MATERIALIZED VIEW CONCURRENTLY`를 통해 무중단 갱신됩니다.
(`CONCURRENTLY` 사용을 위해 모든 MV에 UNIQUE INDEX 필수 설정)

### 갱신 파이프라인 순서

```
raw_events
    ↓
precomputed_events   (1단계: 공통 선계산)
    ↓
mv_daily_trend       (2단계: 일별 집계)
mv_repo_ranking      (2단계: 리포 랭킹)
mv_event_type_dist   (2단계: 타입별 분포)
```

---

### precomputed_events

raw_events에서 날짜/시간 컬럼을 파생하여 하위 MV들이 공통으로 참조하는 선계산 테이블.
`raw_events`와 동일하게 `created_at` 기준 **7일**이 지난 행은 매 파이프라인 실행마다 자동
삭제된다(`prune_precomputed_events` 매크로, ADR-014). 아래 MV들은 매 REFRESH마다 이 테이블
전체를 다시 집계하므로, 7일 이전 구간은 다음 REFRESH부터 랭킹/트렌드 집계에서도 사라진다.

**정의**
```sql
SELECT
    event_id,
    type,
    actor_login,
    actor_id,
    repo_name,
    repo_id,
    (created_at)::DATE        AS event_date,
    EXTRACT(HOUR FROM created_at) AS event_hour,
    created_at
FROM raw_events;
```

**컬럼**

| 컬럼명 | 데이터 타입 | 설명 |
|--------|------------|------|
| event_id | TEXT | 이벤트 고유 ID |
| type | TEXT | 이벤트 타입 |
| actor_login | TEXT | 유저명 |
| actor_id | BIGINT | 유저 내부 ID |
| repo_name | TEXT | 리포명 |
| repo_id | BIGINT | 리포 내부 ID |
| event_date | DATE | 이벤트 발생 날짜 (created_at::DATE 파생) |
| event_hour | NUMERIC | 이벤트 발생 시(hour) (0~23) |
| created_at | TIMESTAMPTZ | 원본 이벤트 발생 시각 |

**인덱스**

| 인덱스명 | 대상 컬럼 | 종류 | 용도 |
|---------|----------|------|------|
| idx_precomputed_events_id | event_id | UNIQUE | REFRESH CONCURRENTLY 요건 충족 |

---

### mv_daily_trend

일별·이벤트 타입별 활동량 집계. 트렌드 차트, 일별 활동 현황 조회에 사용.

**정의**
```sql
SELECT
    event_date,
    type,
    COUNT(*)                        AS event_count,
    COUNT(DISTINCT actor_login)     AS unique_actors,
    COUNT(DISTINCT repo_name)       AS unique_repos
FROM precomputed_events
GROUP BY event_date, type;
```

**컬럼**

| 컬럼명 | 데이터 타입 | 설명 |
|--------|------------|------|
| event_date | DATE | 집계 날짜 |
| type | TEXT | 이벤트 타입 |
| event_count | BIGINT | 해당 날짜·타입의 총 이벤트 수 |
| unique_actors | BIGINT | 해당 날짜·타입에 활동한 고유 유저 수 |
| unique_repos | BIGINT | 해당 날짜·타입에 활동이 있던 고유 리포 수 |

**인덱스**

| 인덱스명 | 대상 컬럼 | 종류 | 용도 |
|---------|----------|------|------|
| idx_mv_daily_trend | (event_date, type) | UNIQUE | REFRESH CONCURRENTLY 요건 충족, 복합 키 조회 |

---

### mv_repo_ranking

리포지터리별·일별 활동량 집계. Star/Fork/Push 카운트 기반 리포 랭킹 조회에 사용.

**정의**
```sql
SELECT
    repo_name,
    event_date,
    COUNT(*) FILTER (WHERE type = 'WatchEvent') AS star_count,
    COUNT(*) FILTER (WHERE type = 'ForkEvent')  AS fork_count,
    COUNT(*) FILTER (WHERE type = 'PushEvent')  AS push_count,
    COUNT(*)                                     AS total_activity
FROM precomputed_events
GROUP BY repo_name, event_date;
```

**컬럼**

| 컬럼명 | 데이터 타입 | 설명 |
|--------|------------|------|
| repo_name | TEXT | 리포지터리명 (owner/repo) |
| event_date | DATE | 집계 날짜 |
| star_count | BIGINT | WatchEvent(Star) 수 |
| fork_count | BIGINT | ForkEvent(Fork) 수 |
| push_count | BIGINT | PushEvent(Push) 수 |
| total_activity | BIGINT | 전체 이벤트 수 |

**인덱스**

| 인덱스명 | 대상 컬럼 | 종류 | 용도 |
|---------|----------|------|------|
| idx_mv_repo_ranking | (repo_name, event_date) | UNIQUE | REFRESH CONCURRENTLY 요건 충족, 리포+날짜 복합 조회 |

---

### mv_event_type_dist

일별·시간대별·이벤트 타입별 분포. 시간대 히트맵, 이벤트 타입 분포 차트에 사용.

**정의**
```sql
SELECT
    event_date,
    event_hour,
    type,
    COUNT(*) AS event_count
FROM precomputed_events
GROUP BY event_date, event_hour, type;
```

**컬럼**

| 컬럼명 | 데이터 타입 | 설명 |
|--------|------------|------|
| event_date | DATE | 집계 날짜 |
| event_hour | NUMERIC | 시간대 (0~23) |
| type | TEXT | 이벤트 타입 |
| event_count | BIGINT | 해당 날짜·시간·타입의 이벤트 수 |

**인덱스**

| 인덱스명 | 대상 컬럼 | 종류 | 용도 |
|---------|----------|------|------|
| idx_mv_event_type_dist | (event_date, event_hour, type) | UNIQUE | REFRESH CONCURRENTLY 요건 충족, 3중 복합 키 조회 |

---

## 3. DB 롤 구성

| 롤 | 권한 | 용도 |
|----|------|------|
| batch_user | CONNECT, INSERT·SELECT on raw_events | GitHub Actions 배치 수집, dbt 실행, MV REFRESH |
| readonly_user | CONNECT, SELECT on ALL TABLES | 웹 대시보드 조회, LLM 챗봇 조회 |

- `ALTER DEFAULT PRIVILEGES` 설정으로 추후 생성되는 테이블/MV에도 자동 권한 부여
- LLM 챗봇은 `readonly_user` 커넥션만 사용 (DELETE·INSERT 원천 차단)
- MV REFRESH는 `batch_user` 커넥션에서만 실행
