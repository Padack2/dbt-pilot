-- MV별 REFRESH 시작/종료 시각 기록. Postgres는 materialized view의
-- 마지막 refresh 시각을 자체적으로 저장하지 않으므로 별도 테이블로 추적한다.
-- 새 테이블이므로 admin 권한으로 1회 실행.

create table if not exists mv_refresh_log (
    id           bigserial primary key,
    mv_name      text not null,
    started_at   timestamptz not null,
    finished_at  timestamptz not null
);

create index if not exists idx_mv_refresh_log_mv_name_started_at
    on mv_refresh_log (mv_name, started_at desc);

grant select, insert on mv_refresh_log to batch_user;
grant select on mv_refresh_log to readonly_user;

grant usage, select on sequence mv_refresh_log_id_seq to batch_user;
