{{ config(materialized='view') }}

-- 급상승 레포(레포당 최신 스냅샷)의 language 분포 (기술스택 랭킹).

select
    language,
    count(*) as repo_count
from {{ ref('trending_repos_with_activity') }}
where language is not null
group by language
order by repo_count desc
