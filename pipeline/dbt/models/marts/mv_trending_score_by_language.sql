{{
    config(
        materialized='materialized_view',
        on_configuration_change='apply',
        indexes=[{'columns': ['language'], 'unique': True}]
    )
}}

-- mv_trending_repo_score(1차 선계산)를 언어별로 집계하는 2차 MV.

select
    coalesce(language, '(알 수 없음)') as language,
    count(*) as repo_count,
    sum(score) as total_score,
    avg(score) as avg_score,
    max(score) as max_score
from {{ ref('mv_trending_repo_score') }}
group by coalesce(language, '(알 수 없음)')
order by total_score desc
