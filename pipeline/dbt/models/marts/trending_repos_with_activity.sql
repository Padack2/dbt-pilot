{{ config(materialized='view') }}

-- 급상승 레포 스냅샷(ADR-004, 하루 1회)과 5분 주기 /events 샘플로 관측한 실제 활동을
-- repo_name으로 교차 조회한다. 스냅샷은 레포당 최신 1건만 사용.

with latest_snapshot as (
    select distinct on (repo_name)
        repo_name, description, stars, forks, language, repo_created_at, repo_pushed_at, captured_at, topics
    from {{ ref('stg_trending_repos_snapshot') }}
    order by repo_name, captured_at desc
),

observed_activity as (
    select
        repo_name,
        count(*) as observed_events,
        count(*) filter (where type = 'WatchEvent') as observed_star_events,
        max(created_at) as last_observed_at
    from {{ ref('precomputed_events') }}
    group by repo_name
)

select
    s.repo_name,
    s.description,
    s.stars,
    s.forks,
    s.language,
    s.repo_created_at,
    s.repo_pushed_at,
    s.captured_at,
    coalesce(o.observed_events, 0) as observed_events,
    coalesce(o.observed_star_events, 0) as observed_star_events,
    o.last_observed_at,
    s.topics
from latest_snapshot s
left join observed_activity o using (repo_name)
