## 메타

- **ADR ID**: ADR-002
- **상태**: 승인
- **날짜**: 2026-09-17
- **작성자**: ab41609924@gmail.com
- **영향 범위**: `.github/workflows/ingest.yml`, `pipeline/observability/should_alert.py`, `pipeline/observability/notify_slack.py`, (참조) `pipeline/sql/pipeline_runs.sql`
- **태그**: pipeline, observability, alerting, github-actions
- **관련 ADR**: ADR-001
- **링크**:

---

## 1) 배경 (Context)

- 파이프라인이 5분마다 실행되는 배치라서, 일시적 네트워크 오류나 GitHub API 순단 등으로도 실패가 잦을 수 있다. 매 실패마다 Slack 알림을 보내면 짧은 시간에 알림이 몰려 무시되는(alert fatigue) 문제가 생긴다.
- Slack 웹훅 하나만 사용하며, 별도 on-call 인력이 있는 것이 아니라 개인/소규모 운영을 전제로 한다.
- 목표: 지속적인 실패(진짜 문제) 상황일 때만 알림을 받고, 일시적 실패로는 알림 노이즈를 만들지 않는다.
- 비목표: 알림 채널 다변화(PagerDuty 등)나 실패 자동 복구는 범위 밖.

## 2) 고려한 선택지 (Options)

- 옵션 A: 실패할 때마다 즉시 Slack 알림
    - 장점: 구현이 단순하고, 실패를 놓칠 위험이 없음(즉시성)
    - 단점/리스크: 5분 주기 특성상 일시적 오류에도 알림이 쏟아져 알림 피로가 발생하고, 정작 중요한 알림도 묻힐 위험이 있음
- 옵션 B: `pipeline_runs`에서 연속 실패 횟수를 조회해, 임계값(`FAILURE_ALERT_THRESHOLD`)의 배수에 도달했을 때만 알림
    - 장점: 알림 피로 방지, 지속적 실패(진짜 문제)는 여전히 감지, 임계값을 env var로 조정 가능
    - 단점/리스크: 첫 실패 시점에는 알림이 가지 않아 대응이 threshold만큼 늦어짐, threshold 값 설정이 다소 임의적(현재 3)

## 3) 결정 (Decision)

- 최종 선택: 옵션 B
- 결정 이유(Trade-off): 5분 주기 배치 특성상 일시적 실패 빈도가 높을 것으로 예상되어, 즉시성보다 알림의 신호 대 잡음비를 우선했다. ADR-001에서 만든 `pipeline_runs` 이력 테이블을 그대로 재사용해 연속 실패 스트릭을 계산한다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 알림 채널의 신호 대 잡음비 개선, 알림을 무시하게 되는 습관화 방지
- 부정적 영향/부채: 첫 실패부터 threshold번째 실패까지(현재 설정 기준 약 15분)는 무알림 구간이 발생해 심각한 장애도 초기 대응이 늦어질 수 있음
- 추후 작업(TODO): 운영하면서 threshold 값 튜닝, 장애 심각도 구분(예: DB 연결 실패는 즉시 알림) 필요성 재검토

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: 연속 실패를 인위적으로 3회 발생시켜(예: 잘못된 시크릿 값으로 임시 실행) threshold 배수 시점에만 Slack 알림이 오는지 확인
- 롤백 전략: `should_alert.py` 스텝을 건너뛰고 `notify_slack.py` 호출 조건을 `failure()`로만 되돌리면 즉시 옵션 A로 복귀 가능. `FAILURE_ALERT_THRESHOLD`를 1로 낮추는 것만으로도 사실상 즉시 알림과 동일한 효과를 낼 수 있음
