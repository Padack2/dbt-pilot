{{ config(materialized='view') }}

-- 급상승 레포(레포당 최신 스냅샷)의 topics를 펼쳐서 가장 많이 언급된 키워드를 집계한다.

select
    unnest(topics) as topic,
    count(*) as repo_count
from {{ ref('trending_repos_with_activity') }}
where topics is not null
group by topic
order by repo_count desc
