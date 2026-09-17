# 대시보드 UI 구조 계획

- 프로젝트: dbt-pilot (apps/web)
- 최종 수정: 2026-09-17
- 상태: 구현 완료

---

## 1. 배경

지금까지 `apps/web/src/app/page.tsx` 한 페이지에 실행 이력, MV 리프레시, 모델 용량,
급상승 레포, 키워드/기술스택, 리포 랭킹을 전부 쌓아왔다. 기능이 늘면서 "운영 현황"과
"분석 결과"가 한 화면에 섞여 오히려 한눈에 안 들어오는 상태가 됐다. 성격이 다른 콘텐츠를
메뉴 4개로 분리한다.

- 목표: 운영(파이프라인 실행/모델 REFRESH), 탐색(로우 데이터 조회), 분석(트렌드/랭킹)을
  메뉴로 분리해 각 화면을 다시 "한눈에 보기" 가능한 밀도로 되돌린다.
- 비목표: 이번 계획은 화면 재배치이지 신규 데이터 소스 추가가 아니다. `데이터 조회` 메뉴만
  신규 구현이 필요하고, 나머지 3개는 기존에 구현된 컴포넌트를 옮기는 작업이다.

## 2. 메뉴 구조

| # | 메뉴 | 라우트 | 비고 |
|---|------|--------|------|
| 1 | 데이터 수집 파이프라인 현황 | `/pipeline` | 기존 구현 이동 |
| 2 | 증분 모델 REFRESH 현황 | `/models` | 기존 구현 이동 |
| 3 | 데이터 조회 (로우 데이터 및 증분 모델) | `/explorer` | 신규 구현 |
| 4 | 분석 결과 조회 | `/` (홈) | 기존 구현 이동 |

공통 상단 네비게이션(4개 탭)을 `layout.tsx`에 추가하고, 각 메뉴는 독립된 라우트로 분리한다.
전부 조회 전용이라 지금처럼 각 페이지는 Server Component가 readonly 롤로 직접 쿼리하는
구조를 그대로 유지한다 (API Route 불필요 — 클라이언트 트리거가 필요한 REFRESH 버튼이
추가될 때만 예외).

## 3. 메뉴별 상세

### 3.1 데이터 수집 파이프라인 현황 (`/pipeline`)

`ingest.yml` 워크플로우(수집 → dbt build)의 실행 현황. **기존 `page.tsx`에서 그대로 이동.**

| 콘텐츠 | 데이터 소스 | 상태 |
|--------|------------|------|
| 요약 카드 (마지막 실행/성공률/평균 소요시간/수집 row 합계) | `lib/pipeline-runs.ts` (`summarize`) | 이동 |
| 실행 타임라인 (최근 20건 성공/실패 바) | `lib/pipeline-runs.ts` | 이동 |
| 실행 이력 표 (시작시각/상태/소요시간/수집row/에러) | `lib/pipeline-runs.ts` | 이동 |

### 3.2 증분 모델 REFRESH 현황 (`/models`)

`precomputed_events`(incremental)와 MV 3종의 "모델 자체" 상태. **기존 `page.tsx`에서 그대로 이동.**

| 콘텐츠 | 데이터 소스 | 상태 |
|--------|------------|------|
| MV 리프레시 현황 카드 (마지막 리프레시 시각/소요시간) | `lib/mv-refresh.ts` | 이동 |
| 모델 용량/Row 수 표 (precomputed_events + MV 3종) | `lib/model-sizes.ts` | 이동 |

### 3.3 데이터 조회 (`/explorer`) — 신규

`raw_events`(로우 데이터)와 `precomputed_events`(증분 모델)를 직접 브라우징하는 화면.
MV/트렌딩처럼 이미 집계된 결과가 아니라 원본에 가까운 row 단위 조회가 목적이라 별도 메뉴로 둔다.

| 콘텐츠 | 데이터 소스 | 상태 |
|--------|------------|------|
| `raw_events` 조회 (필터: type, repo_name, 날짜 range / 정렬: created_at desc / 페이지네이션) | 신규 `lib/raw-events.ts` | 신규 구현 |
| `precomputed_events` 조회 (동일 패턴, event_date/event_hour 필터 추가) | 신규 `lib/precomputed-events.ts` | 신규 구현 |

설계 메모:
- 필터 UI는 기존 "리포 랭킹 Top N"에서 쓴 패턴(순수 GET `<form>` + `searchParams`)을 그대로 재사용 — 클라이언트 JS 없이 서버 컴포넌트 재렌더링으로 충분.
- 두 테이블 다 row 수가 계속 늘어나므로 `LIMIT`을 기본값(예: 50)으로 강제하고, 페이지네이션은 우선 `OFFSET` 기반으로 단순하게 시작. 데이터가 더 커지면 keyset pagination(`created_at < :cursor`)으로 전환 검토.
- 정렬 컬럼처럼 사용자가 고르는 값을 SQL에 직접 꽂아야 하는 지점(있다면)은 지금까지 해온 대로 화이트리스트 검증 필수 (`lib/repo-ranking.ts`의 `isRankingMetric` 패턴 참고).

### 3.4 분석 결과 조회 (`/`, 홈)

트렌드/랭킹처럼 이미 가공된 분석 결과. **기존 `page.tsx`에서 그대로 이동.** 앞으로 이 메뉴가
분석 기능이 늘어날 때 우선적으로 채워질 자리다.

| 콘텐츠 | 데이터 소스 | 상태 |
|--------|------------|------|
| 급상승 레포 (ADR-004) | `lib/trending-repos.ts` | 이동 |
| 급상승 키워드 / 기술스택 | `lib/trending-rankings.ts` | 이동 |
| 리포 랭킹 Top N (날짜/기준/개수 필터) | `lib/repo-ranking.ts` | 이동 |
| (검토) `mv_daily_trend` 일별 트렌드 차트 | 신규 | 아직 대시보드에 없음. 다음 분석 기능 후보 |
| (검토) `mv_event_type_dist` 시간대별 분포 | 신규 | 아직 대시보드에 없음. 다음 분석 기능 후보 |

## 4. 라우트/파일 구조

```
apps/web/src/app/
  layout.tsx        공통 네비게이션(4개 탭) 추가
  page.tsx           분석 결과 조회 (홈)
  pipeline/page.tsx  데이터 수집 파이프라인 현황
  models/page.tsx    증분 모델 REFRESH 현황
  explorer/page.tsx  데이터 조회 (신규)
```

네비게이션은 현재 경로 하이라이트가 필요해 `usePathname`을 쓰는 작은 Client
Component(`components/NavBar.tsx`)로 분리하고, 나머지 페이지는 지금처럼 전부 Server
Component로 유지한다.

## 5. 마이그레이션 순서

1. `layout.tsx`에 4탭 네비게이션 추가 (다음 단계 전이라도 먼저 넣어서 빈 페이지 이동 흐름 확인)
2. `page.tsx`의 기존 섹션들을 성격에 맞게 `pipeline/page.tsx`, `models/page.tsx`로 분리 이동 (lib 파일은 변경 없음)
3. `page.tsx`(홈)를 분석 결과 섹션만 남기고 정리
4. `explorer/page.tsx` 신규 구현 (raw_events → precomputed_events 순서로)

## 6. 향후 확장 여지

- Phase 2 LLM 챗봇: 별도 5번째 메뉴(`/chat`)로 추가 예정. 지금 구조에서 탭 하나 늘리면 되므로 이번 계획과 충돌 없음.
- Phase 3 Grafana 연동: 대시보드 내부 메뉴가 아니라 외부 링크(임베드 or 새 탭)로 연결하는 방식 검토.
