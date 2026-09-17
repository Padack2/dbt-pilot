-- 파이프라인(수집 + dbt build) 실행 이력. 대시보드가 GitHub Actions API를
-- 직접 호출하지 않고도 "모델 상태/마지막 실행 시각"을 보여줄 수 있도록 함.
-- 새 테이블이므로 admin 권한으로 1회 실행.

create table if not exists pipeline_runs (
    id             bigserial primary key,
    started_at     timestamptz not null,
    finished_at    timestamptz not null,
    status         text not null check (status in ('success', 'failure')),
    rows_ingested  integer,
    error_message  text,
    github_run_id  text
);

create index if not exists idx_pipeline_runs_started_at on pipeline_runs (started_at desc);

grant select, insert on pipeline_runs to batch_user;
grant select on pipeline_runs to readonly_user;
