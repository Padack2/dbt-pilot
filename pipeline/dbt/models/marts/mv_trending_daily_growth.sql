{{
    config(
        materialized='materialized_view',
        on_configuration_change='apply',
        indexes=[{'columns': ['repo_name', 'event_date'], 'unique': True}]
    )
}}

-- 급상승 레포 스냅샷(8시간마다)을 일 단위로 묶어, 전일 대비 스타/포크 증가량을 계산한다.
-- Search API의 stargazers_count/forks_count는 GitHub이 관리하는 누적 총계라,
-- 우리가 관측한 이벤트 수보다 훨씬 정확한 "실제 증가량"을 계산할 수 있다.

with daily_snapshot as (
    select
        repo_name,
        captured_at::date as event_date,
        max(stars) as stars,
        max(forks) as forks
    from {{ ref('stg_trending_repos_snapshot') }}
    group by repo_name, captured_at::date
)

select
    repo_name,
    event_date,
    stars,
    forks,
    stars - lag(stars) over (partition by repo_name order by event_date) as star_growth,
    forks - lag(forks) over (partition by repo_name order by event_date) as fork_growth
from daily_snapshot
