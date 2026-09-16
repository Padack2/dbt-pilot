{{
    config(
        materialized='materialized_view',
        on_configuration_change='apply',
        indexes=[{'columns': ['repo_name', 'event_date'], 'unique': True}]
    )
}}

select
    repo_name,
    event_date,
    count(*) filter (where type = 'WatchEvent') as star_count,
    count(*) filter (where type = 'ForkEvent') as fork_count,
    count(*) filter (where type = 'PushEvent') as push_count,
    count(*) as total_activity
from {{ ref('precomputed_events') }}
group by repo_name, event_date
