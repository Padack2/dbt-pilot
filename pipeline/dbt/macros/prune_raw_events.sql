{#
    raw_events는 5분마다 계속 append되고 별도 삭제 로직이 없어 무한정 커진다(ADR-013).
    precomputed_events의 incremental 워터마크는 raw_events가 아니라 precomputed_events
    자신의 max(created_at) 기준이라, 오래된 raw_events를 지워도 이후 5분 주기 incremental
    실행에는 영향이 없다 — 단 `dbt build --full-refresh`로 처음부터 다시 만들 경우에는
    지워진 구간의 원본이 영구히 사라진다(허용된 트레이드오프, ADR-013 참고).
#}
{% macro prune_raw_events(days=7) %}
    {% set result = run_query(
        "with deleted as (delete from raw_events where created_at < now() - interval '"
        ~ days ~ " days' returning 1) select count(*) as n from deleted"
    ) %}
    {% set deleted_count = result.columns[0].values()[0] %}
    {{ log('Pruned ' ~ deleted_count ~ ' raw_events rows older than ' ~ days ~ ' days', info=true) }}
{% endmacro %}
