{{
    config(
        materialized='incremental',
        unique_key='event_id'
    )
}}

select
    event_id,
    type,
    actor_login,
    actor_id,
    repo_name,
    repo_id,
    created_at::date as event_date,
    extract(hour from created_at) as event_hour,
    created_at
from {{ ref('stg_github_events') }}

{% if is_incremental() %}
where created_at > (select coalesce(max(created_at), '1970-01-01') from {{ this }})
{% endif %}
