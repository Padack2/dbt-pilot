-- GitHub Search API로 하루 1회 수집하는 급상승(신생 인기) 레포 스냅샷 (ADR-004).
-- 새 테이블이므로 admin 권한으로 1회 실행.

create table if not exists trending_repos_snapshot (
    id               bigserial primary key,
    repo_name        text not null,
    description      text,
    stars            integer not null,
    forks            integer not null,
    language         text,
    repo_created_at  timestamptz,
    repo_pushed_at   timestamptz,
    captured_at      timestamptz not null
);

-- 테이블이 이미 생성된 환경 대비 (컬럼 추가만 반영)
alter table trending_repos_snapshot add column if not exists description text;

create index if not exists idx_trending_repos_snapshot_repo_captured
    on trending_repos_snapshot (repo_name, captured_at desc);
create index if not exists idx_trending_repos_snapshot_captured_at
    on trending_repos_snapshot (captured_at desc);

grant select, insert on trending_repos_snapshot to batch_user;
grant select on trending_repos_snapshot to readonly_user;

grant usage, select on sequence trending_repos_snapshot_id_seq to batch_user;
