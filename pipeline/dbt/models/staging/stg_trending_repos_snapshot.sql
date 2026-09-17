select
    repo_name,
    description,
    stars,
    forks,
    language,
    repo_created_at,
    repo_pushed_at,
    captured_at,
    topics
from {{ source('raw', 'trending_repos_snapshot') }}
