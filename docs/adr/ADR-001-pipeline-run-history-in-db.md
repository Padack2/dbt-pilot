## 메타

- **ADR ID**: ADR-001
- **상태**: 승인
- **날짜**: 2026-09-17
- **작성자**: 김아진
- **영향 범위**: `pipeline/sql/pipeline_runs.sql`, `pipeline/observability/record_run.py`, `.github/workflows/ingest.yml`, (참조) 향후 `apps/web` 대시보드
- **태그**: pipeline, observability, database
- **관련 ADR**: ADR-002
- **링크**:

---

## 1) 배경 (Context)

- 파이프라인(GitHub Events 수집 + dbt build)이 5분마다 GitHub Actions에서 실행되는데, 대시보드에서 "마지막 실행 시각/상태/처리 row 수"를 보여주려면 실행 이력에 접근할 방법이 필요했다.
- 대시보드(`apps/web`)는 이미 Neon Postgres에 `readonly_user`로 접속해 조회하고 있다. GitHub Actions의 실행 이력은 GitHub REST API를 통해서만 조회 가능하며, 이를 쓰려면 별도 인증(PAT/GitHub App)과 rate limit 관리가 추가로 필요하다.
- 목표: 대시보드가 파이프라인의 성공/실패, 마지막 실행 시각, 처리 row 수를 조회할 수 있어야 한다.
- 비목표: Actions 스텝별 상세 로그까지 대시보드에 노출하는 것은 범위 밖.

## 2) 고려한 선택지 (Options)

- 옵션 A: 대시보드가 GitHub Actions REST API를 직접 호출해 실행 이력 조회
    - 장점: 별도 테이블/기록 로직이 불필요하고, Actions가 이미 갖고 있는 정보를 재사용
    - 단점/리스크: 대시보드에 GitHub PAT/App 인증이 추가로 필요(보안 노출면 증가), GitHub API rate limit에 종속, Actions 응답 구조에 대시보드가 결합됨
- 옵션 B: 파이프라인 실행마다 `pipeline_runs` 테이블에 성공/실패/row 수/에러 메시지를 기록
    - 장점: 대시보드는 이미 쓰는 Postgres 연결만으로 조회 가능(추가 인증 불필요), 스키마를 직접 정의하므로 쿼리/집계가 자유로움, CI 도구를 교체하더라도 인터페이스가 바뀌지 않음
    - 단점/리스크: 기록 자체가 실패하면(DB 커넥션 문제 등) 이력 유실 가능, 테이블 관리(보존기간/정리) 부담 추가

## 3) 결정 (Decision)

- 최종 선택: 옵션 B
- 결정 이유(Trade-off): 대시보드가 이미 `batch_user`/`readonly_user`로 Postgres에 접근하고 있어 추가 인증 계층 없이 통합할 수 있고, GitHub Actions라는 특정 CI 서비스에 대한 결합도를 낮출 수 있다. `record_run.py`가 매 실행(성공/실패 모두) 종료 시 `pipeline_runs`에 INSERT한다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 대시보드 구현이 단순해짐(SQL 쿼리 하나), GitHub 인증이 불필요, CI 도구 교체에 유연
- 부정적 영향/부채: `pipeline_runs` 기록 자체가 실패하면(DB 다운 등) 이력 공백이 발생하며 이에 대한 별도 알림은 없음. 테이블 보존기간(retention) 정책이 아직 없음
- 추후 작업(TODO): `pipeline_runs` row 보존기간/파티셔닝 정책 검토, 기록 실패 자체를 감지하는 안전장치 검토

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: `workflow_dispatch`로 성공/실패 케이스를 각각 1회 수동 실행해 `pipeline_runs`에 정상 기록되는지 확인
- 롤백 전략: 워크플로우에서 `record_run.py` 호출 스텝만 제거하면 되고, 테이블 자체는 남겨둬도 무해함. 대시보드가 이 테이블에 의존하기 전이라면 롤백 비용은 낮음
