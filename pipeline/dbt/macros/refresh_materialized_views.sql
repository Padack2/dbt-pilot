{#
    dbt-postgres의 materialized_view materialization은 설정(config/SQL) 변경 시에만
    DDL을 적용하고, 데이터 자체는 자동으로 refresh하지 않는다.
    그래서 `dbt run` 이후 이 run-operation을 별도로 실행해 REFRESH CONCURRENTLY를 트리거한다.
    (각 모델의 indexes 설정에 unique index가 있어야 CONCURRENTLY가 가능)
#}
{% macro refresh_materialized_views() %}
    {# mv_trending_score_by_language는 mv_trending_repo_score를 참조하므로 반드시 그 뒤에 refresh한다 #}
    {% set mv_models = [
        'mv_daily_trend', 'mv_repo_ranking', 'mv_event_type_dist', 'mv_trending_daily_growth',
        'mv_trending_repo_score', 'mv_trending_score_by_language'
    ] %}
    {% for mv in mv_models %}
        {% set relation = ref(mv) %}
        {% set started_at = run_query('select now()').columns[0].values()[0] %}
        {{ log('Refreshing ' ~ relation, info=true) }}
        {% do run_query('refresh materialized view concurrently ' ~ relation) %}
        {% set finished_at = run_query('select now()').columns[0].values()[0] %}
        {% do run_query(
            "insert into mv_refresh_log (mv_name, started_at, finished_at) values ('"
            ~ mv ~ "', '" ~ started_at ~ "'::timestamptz, '" ~ finished_at ~ "'::timestamptz)"
        ) %}
    {% endfor %}
{% endmacro %}
