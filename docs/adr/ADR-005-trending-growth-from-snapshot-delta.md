## 메타

- **ADR ID**: ADR-005
- **상태**: 승인
- **날짜**: 2026-09-17
- **작성자**: 김아진
- **영향 범위**: `pipeline/dbt/models/marts/mv_trending_daily_growth.sql`, `pipeline/dbt/macros/refresh_materialized_views.sql`, `apps/web/src/lib/trending-growth.ts`, `apps/web/src/app/page.tsx`(참조)
- **태그**: pipeline, dbt, data-modeling, analytics
- **관련 ADR**: ADR-004
- **링크**:

---

## 1) 배경 (Context)

- 대시보드에 "레포별 일 단위 Star/Fork 증가량" 시각화를 추가하기로 했다. 이 지표를 계산할 후보 데이터 소스가 두 가지 있었다: (1) 5분마다 수집하는 `/events` 샘플에서 `WatchEvent`/`ForkEvent` 발생 건수를 세는 방법, (2) ADR-004에서 도입한 GitHub Search API 스냅샷(`trending_repos_snapshot`, 8시간마다)의 `stars`/`forks` 누적치를 날짜별로 비교하는 방법.
- ADR-004의 배경에서 이미 실측 확인한 사실: `/events` 샘플은 GitHub 전체 공개 활동의 아주 작은 무작위 슬라이스라 레포 하나당 관측되는 이벤트가 대부분 0~1건에 그친다. (1)로 "일 단위 Star 증가량"을 세면 실제 증가량을 심하게 과소측정하게 된다.
- 목표: 실제 증가량에 최대한 가까운 수치를 보여준다.
- 비목표: 초 단위/실시간 증가량 추적(스냅샷 주기 이상의 해상도는 다루지 않음).

## 2) 고려한 선택지 (Options)

- 옵션 A: `/events` 샘플에서 WatchEvent/ForkEvent 카운트를 일별로 집계 (기존 `mv_repo_ranking`과 동일한 방식 재사용)
    - 장점: 이미 존재하는 파이프라인/모델 재사용, 추가 데이터 소스 불필요
    - 단점/리스크: ADR-004에서 이미 증명된 샘플링 희소성 문제를 그대로 물려받음 — 실제로는 하루에 수백 번씩 스타가 늘어도 우리 샘플엔 0~1건만 잡혀 그래프가 사실상 무의미해짐
- 옵션 B: GitHub Search API 스냅샷의 `stars`/`forks` 누적치를 날짜별 최댓값으로 묶고, 전일 대비 차이를 `lag()` 윈도우 함수로 계산 (채택)
    - 장점: `stars`/`forks` 값 자체가 GitHub이 관리하는 정확한 누적 총계라 우리 샘플링 해상도에 구애받지 않음. 이미 ADR-004로 확보한 데이터를 재사용해 추가 API 호출/인프라가 필요 없음
    - 단점/리스크: 스냅샷이 8시간 간격이라 "하루 증가량"은 정확히는 "그날 마지막 스냅샷 값 - 전날 마지막 스냅샷 값"이며 자정 기준 정확한 경계와는 다를 수 있음. 스냅샷이 하루 이상 누락되면(예: `trending.yml` 실패) 다음 성공한 스냅샷과의 차이가 여러 날치를 합친 값으로 나타나는데 이를 구분하는 로직은 없음. 레포가 검색 조건에서 밀려나 스냅샷 대상에서 빠지는 날에는 시계열이 끊김
    - 대응: 위 리스크들은 "며칠치가 합쳐진 증가량"이 그래프에서 값이 크게 튀는 형태로 바로 드러나므로, 회계 수준의 정확도가 필요 없는 이 대시보드 용도로는 감내 가능하다고 판단
- 옵션 C: GitHub의 별도 스타 히스토리 API 사용
    - 장점: 존재한다면 가장 정확
    - 단점/리스크: GitHub REST/GraphQL API에 레포의 과거 스타 증가 이력을 직접 제공하는 공식 엔드포인트가 없음(널리 쓰이는 서드파티 스타 히스토리 도구들도 결국 "현재 스타 수를 주기적으로 폴링해 누적"하는 동일한 방식). 채택 가능한 옵션이 아니라고 판단

## 3) 결정 (Decision)

- 최종 선택: 옵션 B. 신규 dbt materialized view `mv_trending_daily_growth`를 추가해 `stg_trending_repos_snapshot`을 `captured_at::date` 기준으로 묶고(`max(stars)`, `max(forks)`), `lag() over (partition by repo_name order by event_date)`로 전일 대비 증가량을 계산한다.
- 결정 이유(Trade-off): 정확도(GitHub이 관리하는 실제 누적치) 대 해상도(8시간 간격이라 정확한 자정 기준 경계는 아님)를 맞바꾼 것인데, 이 대시보드의 목적(트렌드를 대략적으로 보여주는 것)에는 정확도 쪽이 훨씬 중요하다고 판단했다. 옵션 A는 애초에 ADR-004가 지적한 문제를 그대로 재현하므로 채택할 이유가 없었다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 실제 증가량에 가까운 유의미한 시각화 확보. 기존 스냅샷 데이터를 재사용해 추가 수집 비용 $0
- 부정적 영향/부채: 스냅샷 누락 시 증가량이 여러 날치로 뭉쳐 보여도 이를 구분/경고하는 로직이 없음. 레포가 스냅샷 대상에서 빠지면 해당 구간은 결측(null growth)으로 남고 별도 안내 없음. 스냅샷 첫날은 비교할 전날이 없어 항상 `null`(대시보드에서는 0으로 표시)
- 추후 작업(TODO): 스냅샷 간격이 8시간을 초과해 비어있는 구간이 있으면 증가량 대신 "N일치 합산"임을 표시하는 로직 검토. `trending_repos_with_activity`처럼 이 MV도 관측 활동(observed_events)과 교차 비교하는 뷰 추가 검토

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: 스냅샷이 최소 이틀 이상 쌓인 뒤 `select * from mv_trending_daily_growth order by repo_name, event_date;`로 `star_growth`/`fork_growth`가 실제 `stars`/`forks` 차이와 일치하는지 수동 검증
- 롤백 전략: `mv_trending_daily_growth` 모델 파일과 `refresh_materialized_views` 매크로의 등록 라인만 제거하면 되고, `trending_repos_snapshot`/`trending_repos_with_activity` 등 기존 트렌딩 파이프라인에는 영향 없음. 대시보드의 "일별 성장 추이" 섹션만 데이터가 비게 됨.
