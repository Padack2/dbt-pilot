## 메타

- **ADR ID**: ADR-014
- **상태**: 승인
- **날짜**: 2026-09-19
- **작성자**: 김아진
- **영향 범위**: `pipeline/ingest/ingest.py`, `pipeline/dbt/macros/prune_precomputed_events.sql`(신규),
  `.github/workflows/ingest.yml`, `docs/schema.md`
- **태그**: 비용, 유지보수, pipeline
- **관련 ADR**: ADR-013 (raw_events 7일 보존 — 실측 결과 이것만으로는 부족함이 드러남)

---

## 1) 배경 (Context)

- ADR-013으로 `raw_events` 7일 보존을 붙인 뒤 실제 운영 중인 Neon DB 용량을 확인해보니
  다음과 같았다.
  - 수집 시작(2026-09-17)부터 2일 만에 `raw_events`만 279MB, DB 전체 315MB.
  - 실행 로그(`pipeline_runs`) 기준 수집 속도가 5분마다 ~295건으로 매우 안정적 —
    하루 약 85,000건.
  - `raw_events` 평균 row 크기는 행당 약 2,018바이트(인덱스/TOAST 포함)인데, 그중 **93%
    (~1,625바이트)가 `payload`(JSONB) 컬럼**이었다.
  - `payload` 사용처를 코드 전체에서 찾아보니 `stg_github_events.sql`에서 select만 될 뿐
    `precomputed_events`부터는 아예 참조하지 않고, 대시보드/챗봇 어디에서도 조회하지 않는
    완전히 죽은 컬럼이었다.
  - 이 속도를 그대로 7일 유지하면 `raw_events`만 약 1.1~1.2GB — ADR-013의 7일 보존은
    500MB 목표에 크게 못 미친다.
  - 별개로, `precomputed_events`는 ADR-013 당시 보존 정책을 넣지 않아 여전히 무기한
    쌓이는 중이었다(당시 16MB, 하루 ~11~12MB씩 증가 — payload가 없어 raw_events보다는
    느리지만 역시 무기한이면 결국 500MB에 도달).
- 목표: 결제 없이, 그리고 raw_events 조회 기능(`/explorer`)의 최근 7일 조회 범위를 유지한
  채로 실제로 500MB 아래를 유지한다.

## 2) 고려한 선택지 (Options)

- 옵션 A: 보존 기간을 7일보다 훨씬 짧게(2~3일) 줄인다
    - 장점: 코드 변경 없이 매크로 인자만 바꾸면 됨
    - 단점/리스크: `/explorer`의 raw_events 조회 범위가 크게 줄고, payload라는 근본 원인은
      그대로 남아 수집 속도가 조금만 더 빨라져도 다시 위험해짐
- 옵션 B: `payload` 저장을 중단하고, `precomputed_events`에도 동일한 보존 정책을 추가
      (채택)
    - 장점: row 크기가 90%+ 줄어 **7일 보존을 유지하면서도** 여유 있게 500MB 아래로
      들어옴. 애초에 안 쓰는 데이터를 안 쌓는 것이라 기능 손실이 없음.
      `precomputed_events`를 방치하면 raw_events를 고쳐도 결국 그쪽에서 500MB에
      도달하므로 반드시 같이 처리해야 함
    - 단점/리스크: 이미 쌓인 과거 payload는 그대로 남음(마이그레이션 없이 "앞으로만"
      중단하기로 결정 — 즉시 비우고 싶으면 수동 `UPDATE ... SET payload = NULL` 필요).
      `precomputed_events`도 7일 이후 데이터가 사라지므로 MV 기반 랭킹/트렌드 조회 가능
      기간이 7일로 제한됨(ADR-013과 동일한 트레이드오프)
- 옵션 C: 다른 무료 Postgres로 마이그레이션
    - 장점: 코드 변경 없음
    - 단점/리스크: ADR-013에서 이미 기각한 이유와 동일 — 근본 원인(불필요한 payload
      저장 + 무기한 누적)을 그대로 옮길 뿐

## 3) 결정 (Decision)

- 최종 선택: 옵션 B.
  1. `pipeline/ingest/ingest.py`에서 `payload`를 더 이상 채우지 않고 `NULL`로 insert한다
     (컬럼 자체는 스키마 호환을 위해 유지, 과거 데이터는 그대로 둠).
  2. `precomputed_events`에도 `raw_events`와 동일한 7일 보존 매크로
     (`prune_precomputed_events`)를 추가해 매 파이프라인 실행마다 실행한다.
- 결정 이유(Trade-off): payload 제거는 사실상 트레이드오프가 없다(안 쓰는 데이터를
  안 쌓을 뿐). precomputed_events 보존은 ADR-013과 완전히 같은 논리 — 이 프로젝트는
  정확한 장기 분석이 아니라 파이프라인 구현이 목적이라 7일치만 남아도 감내 가능하다고
  판단했다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: payload 제거만으로 앞으로 쌓일 raw_events의 행당 크기가 90%+ 줄어,
  7일 보존을 유지해도 `raw_events` 단독으로는 500MB에 크게 못 미치는 수준(대략
  200~300MB대)이 될 것으로 예상. `precomputed_events`도 상한선이 생김
- 부정적 영향/부채: 이미 저장된 과거 payload(279MB 중 상당 부분)는 이 변경만으로는
  줄어들지 않고, 7일 보존 삭제가 자연스럽게 정리해줄 때까지는 그대로 남아있다. 즉시
  용량을 줄이려면 별도로 `UPDATE raw_events SET payload = NULL WHERE payload IS NOT NULL;`
  실행 필요(이번 결정 범위에서는 보류). `precomputed_events` 보존으로 MV 기반 랭킹/
  트렌드도 7일 이전 데이터는 조회 불가
- 추후 작업(TODO): 배포 후 1~2주 실측치로 실제 정상 상태(steady state) DB 크기를
  재확인. 필요시 이미 쌓인 payload를 일괄 NULL 처리하는 1회성 스크립트 실행 검토

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: 며칠 뒤 `select pg_size_pretty(pg_database_size(current_database()));`와
  `select pg_size_pretty(pg_total_relation_size('raw_events'));`로 실측 재확인.
  파이프라인 로그에서 `Pruned N precomputed_events rows older than 7 days` 확인
- 롤백 전략: `ingest.py`의 payload 라인을 되돌리면 즉시 재수집 시작(과거 미수집 구간은
  복구 불가). `.github/workflows/ingest.yml`의 "Prune precomputed_events" 스텝만 제거하면
  precomputed_events 삭제가 멈춘다
