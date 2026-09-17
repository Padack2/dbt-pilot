{{
    config(
        materialized='materialized_view',
        on_configuration_change='apply',
        indexes=[{'columns': ['repo_name'], 'unique': True}]
    )
}}

-- 급상승 레포를 Star/Fork/최근 성장세에 가중치를 부여해 점수화하는 1차 선계산 MV.
-- 하위 2차 집계 MV(예: mv_trending_score_by_language)들이 이 테이블을 공통으로 참조한다.
--
-- GitHub Search API의 watchers_count는 2012년 이후 stargazers_count와 동일하게 취급되어
-- (실제 "watch/구독" 신호인 subscribers_count는 Search API 응답에 없음) 별도 가중치를 주지 않고,
-- 대신 최근 성장세(star_growth/fork_growth)를 세 번째 축으로 사용한다.
--
-- 가중치는 튜닝 대상 - 필요시 아래 상수만 조정.
{% set star_weight = 1.0 %}
{% set fork_weight = 2.0 %}
{% set growth_weight = 5.0 %}

with latest_growth as (
    select distinct on (repo_name)
        repo_name,
        coalesce(star_growth, 0) as star_growth,
        coalesce(fork_growth, 0) as fork_growth
    from {{ ref('mv_trending_daily_growth') }}
    order by repo_name, event_date desc
)

select
    r.repo_name,
    r.language,
    r.stars,
    r.forks,
    coalesce(g.star_growth, 0) as star_growth,
    coalesce(g.fork_growth, 0) as fork_growth,
    r.stars * {{ star_weight }}
        + r.forks * {{ fork_weight }}
        + (coalesce(g.star_growth, 0) + coalesce(g.fork_growth, 0)) * {{ growth_weight }}
        as score
from {{ ref('trending_repos_with_activity') }} r
left join latest_growth g using (repo_name)
