select
    event_id,
    type,
    actor_login,
    actor_id,
    repo_name,
    repo_id,
    payload,
    public,
    created_at
from {{ source('raw', 'raw_events') }}
