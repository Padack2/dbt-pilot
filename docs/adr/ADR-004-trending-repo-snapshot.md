## 메타

- **ADR ID**: ADR-004
- **상태**: 승인
- **날짜**: 2026-09-17
- **작성자**: ab41609924@gmail.com
- **영향 범위**: `pipeline/sql/trending_repos_snapshot.sql`, `pipeline/ingest/fetch_trending.py`, `.github/workflows/trending.yml`, `pipeline/dbt/models/staging/stg_trending_repos_snapshot.sql`, `pipeline/dbt/models/marts/trending_repos_with_activity.sql`, `apps/web/src/lib/trending-repos.ts`, `apps/web/src/app/page.tsx`(참조), `README.md`(운영 문서)
- **태그**: pipeline, data-source, github-api, dbt
- **관련 ADR**: ADR-003
- **링크**:

---

## 1) 배경 (Context)

- 기존 `/events` 기반 수집(5분마다 최대 300건)은 GitHub 전체 공개 활동의 매우 작은 무작위 샘플이라, 실측 결과 레포 하나당 관측되는 이벤트가 대부분 0~1건에 그쳤다. `mv_repo_ranking`으로 "인기 레포 랭킹"을 만들어봐도 상위권 대부분이 star/fork/push 0에 total_activity 1 수준이라 신호로 쓰기엔 너무 약했다.
- GitHub REST API 문서를 확인한 결과 공식 trending 엔드포인트는 존재하지 않는다. 가장 가까운 대안은 Search API(`GET /search/repositories`)로, `created:>날짜` + `sort=stars` 조합으로 "최근 생성되고 스타가 급증한 레포"를 근사할 수 있다.
- 목표: 실제로 의미 있는 "지금 뜨는 레포" 신호를 확보하고, 가능하면 기존에 쌓아온 활동 데이터(`precomputed_events`)와 연결해 활용도를 높인다.
- 비목표: github.com/trending 페이지와 100% 동일한 결과 재현(비공식 스크래핑 제외), 초 단위 실시간 트렌딩 감지.

## 2) 고려한 선택지 (Options)

- 옵션 A: 기존 `/events` 샘플만으로 랭킹 유지 (현행)
    - 장점: 추가 구현 없음, 이미 있는 데이터/코드 재사용
    - 단점/리스크: 실측 결과 신호가 너무 약해 "트렌딩" 용도로 기능하지 않음. 샘플링 확률상 실제로 뜨는 레포조차 우연히 우리 300건 샘플에 안 걸릴 수 있음
- 옵션 B: GitHub Search API로 8시간마다 "신생 인기 레포" 스냅샷을 별도 수집 (신규 테이블 + 신규 워크플로우)
    - 장점: 공식 문서화된 API. 인증 시 분당 30회 한도인데 8시간마다(하루 3회)만 호출하므로 여유 충분. 기존 트리거 방식(ADR-003의 외부 cron + `workflow_dispatch`)을 그대로 재사용 가능. 기존 `raw_events`/`precomputed_events`/`mv_repo_ranking`은 전혀 건드리지 않아 회귀 위험이 없음
    - 단점/리스크: "진짜 트렌딩 알고리즘"은 아니고 생성일+스타 기준 근사치. GitHub Search API 스키마/정책 변경에 대한 의존이 하나 늘어남
- 옵션 C: github.com/trending 페이지 스크래핑
    - 장점: GitHub 공식 트렌딩 결과와 100% 일치
    - 단점/리스크: 문서화되지 않은 방식이라 페이지 구조가 바뀌면 즉시 깨짐. GitHub ToS상 크롤링 관련 리스크. 유지보수 부담이 지속적으로 발생

## 3) 결정 (Decision)

- 최종 선택: **옵션 B**. Search API를 `q=created:>7일전&sort=stars&order=desc&per_page=50` 조건으로 8시간마다 호출해 `trending_repos_snapshot` 테이블에 적재한다.
- 트리거는 ADR-003과 동일한 패턴(외부 cron-job.org → `workflow_dispatch`)을 재사용하되, 5분 주기 `ingest.yml`과는 실행 빈도가 완전히 다르므로 별도 워크플로우 `trending.yml`로 분리해 서로 독립적으로 실패/재시도되게 한다.
- 기존 데이터와의 연관관계: dbt 마트 모델 `trending_repos_with_activity`를 추가해, 스냅샷(레포당 최신 1건)과 `precomputed_events`에서 집계한 관측 활동(전체 이벤트 수, WatchEvent 수, 마지막 관측 시각)을 `repo_name`으로 LEFT JOIN한다. 이를 통해 "공식적으로 뜨는 레포 중 우리 5분 샘플에도 실제로 잡힌 것"을 함께 보여줄 수 있다. 데이터 양이 작고 8시간마다만 갱신되므로 MV가 아닌 일반 `view`로 충분하다.
- 결정 이유(Trade-off): 공식 API 기반이라 안정적이고, 오늘까지 안정화한 5분 주기 파이프라인을 전혀 건드리지 않아 리스크가 없다. 두 데이터셋을 조인함으로써 신규 데이터 소스 하나 추가에 그치지 않고 기존 자산(활동 스트림)의 활용도까지 같이 높일 수 있어, 단순 스크래핑(옵션 C)보다 유지보수 비용 대비 얻는 게 크다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 실제로 유의미한 "떠오르는 레포" 신호 확보. 기존 파이프라인 무변경으로 회귀 위험 없음. 트렌딩 스냅샷과 우리 샘플링 활동을 나란히 보여줌으로써 대시보드에서 "우리 샘플링의 한계"도 자연스럽게 드러남(옵션 A 문제의 시각화)
- 부정적 영향/부채: GitHub Search API 스키마/정책 변경에 대한 의존 추가. "생성일+스타" 근사치라 실제 trending 알고리즘(예: 최근 24시간 스타 증가폭)과는 다를 수 있음. 새 테이블/워크플로우가 하나 늘어 운영 포인트 증가
- 추후 작업(TODO): `pushed:>` 조건을 조합한 "활발히 유지되는 인기 레포" 뷰 추가 검토, 스냅샷이 여러 번 쌓이면 "직전 스냅샷 대비 스타 증가폭" 계산 검토, cron-job.org에 `trending.yml`용 8시간 주기 job 추가

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: `workflow_dispatch`로 `trending.yml` 수동 실행 → `select count(*) from trending_repos_snapshot;`로 적재 확인 → 다음 `ingest.yml` 실행(또는 수동 `dbt build`) 후 `select * from trending_repos_with_activity order by stars desc limit 10;`로 조인 결과 확인
- 롤백 전략: cron-job.org의 해당 job만 비활성화하면 신규 스냅샷 적재가 멈추고, `trending_repos_with_activity` 뷰는 마지막 스냅샷 기준으로 유지된다(기존 파이프라인에는 영향 없음). 완전 제거 시 `trending.yml`, `stg_trending_repos_snapshot.sql`, `trending_repos_with_activity.sql`, `fetch_trending.py`를 삭제하고 `trending_repos_snapshot` 테이블을 drop하면 된다.
