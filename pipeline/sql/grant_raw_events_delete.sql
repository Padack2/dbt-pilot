-- raw_events 보존 정책(ADR-013) 적용을 위해 batch_user에 DELETE 권한을 추가로 부여한다.
-- batch_user는 원래 raw_events에 INSERT/SELECT만 가지고 있었다(append-only 안전장치,
-- docs/schema.md 참고) — dbt가 직접 만든 다른 테이블들과 달리 raw_events는 admin이 만든
-- 테이블이라 소유권으로 권한이 자동 부여되지 않기 때문이다. prune_raw_events 매크로가
-- "permission denied for table raw_events"로 실패한다면 이 스크립트가 아직 실행되지 않은
-- 것이다. 새 권한 부여이므로 admin 권한으로 1회 실행.

grant delete on raw_events to batch_user;
