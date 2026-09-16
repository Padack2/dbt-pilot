{{
    config(
        materialized='materialized_view',
        on_configuration_change='apply',
        indexes=[{'columns': ['event_date', 'event_hour', 'type'], 'unique': True}]
    )
}}

select
    event_date,
    event_hour,
    type,
    count(*) as event_count
from {{ ref('precomputed_events') }}
group by event_date, event_hour, type
