{#
    precomputed_events는 raw_events처럼 계속 append되는데 보존 정책이 없어 무기한 커진다
    (ADR-014). mv_daily_trend/mv_repo_ranking/mv_event_type_dist는 매 REFRESH마다
    precomputed_events 전체를 다시 GROUP BY하는 구조라, 오래된 행을 지우면 다음 REFRESH부터
    그 구간의 MV 집계도 함께 사라진다 — 이 프로젝트에서는 raw_events와 동일하게 감내하기로
    한 트레이드오프다(ADR-014, ADR-013 참고).
#}
{% macro prune_precomputed_events(days=7) %}
    {% set result = run_query(
        "with deleted as (delete from precomputed_events where created_at < now() - interval '"
        ~ days ~ " days' returning 1) select count(*) as n from deleted"
    ) %}
    {% set deleted_count = result.columns[0].values()[0] %}
    {{ log('Pruned ' ~ deleted_count ~ ' precomputed_events rows older than ' ~ days ~ ' days', info=true) }}
{% endmacro %}
