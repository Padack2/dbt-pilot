{#
    dbt-postgres의 materialized_view materialization은 설정(config/SQL) 변경 시에만
    DDL을 적용하고, 데이터 자체는 자동으로 refresh하지 않는다.
    그래서 `dbt run` 이후 이 run-operation을 별도로 실행해 REFRESH CONCURRENTLY를 트리거한다.
    (각 모델의 indexes 설정에 unique index가 있어야 CONCURRENTLY가 가능)
#}
{% macro refresh_materialized_views() %}
    {% set mv_models = ['mv_daily_trend', 'mv_repo_ranking', 'mv_event_type_dist'] %}
    {% for mv in mv_models %}
        {% set relation = ref(mv) %}
        {{ log('Refreshing ' ~ relation, info=true) }}
        {% do run_query('refresh materialized view concurrently ' ~ relation) %}
    {% endfor %}
{% endmacro %}
