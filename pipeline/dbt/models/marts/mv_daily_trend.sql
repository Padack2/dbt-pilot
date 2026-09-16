{{
    config(
        materialized='materialized_view',
        on_configuration_change='apply',
        indexes=[{'columns': ['event_date', 'type'], 'unique': True}]
    )
}}

select
    event_date,
    type,
    count(*) as event_count,
    count(distinct actor_login) as unique_actors,
    count(distinct repo_name) as unique_repos
from {{ ref('precomputed_events') }}
group by event_date, type
