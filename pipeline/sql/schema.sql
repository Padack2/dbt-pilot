-- raw_events는 이미 존재하는 테이블이므로 ALTER로 부족한 컬럼/인덱스만 보강한다.
-- (테이블 자체가 없는 환경 대비용 CREATE TABLE IF NOT EXISTS는 안전하게 no-op)

create table if not exists raw_events (
    event_id    text primary key,
    type        text not null,
    actor_login text not null,
    repo_name   text not null,
    payload     jsonb,
    created_at  timestamptz not null
);

alter table raw_events add column if not exists actor_id bigint;
alter table raw_events add column if not exists repo_id bigint;
alter table raw_events add column if not exists public boolean default true;

create index if not exists idx_raw_events_created_at on raw_events (created_at desc);
create index if not exists idx_raw_events_type on raw_events (type);
create index if not exists idx_raw_events_repo_name on raw_events (repo_name);
