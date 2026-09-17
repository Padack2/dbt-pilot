import { readonlyPool } from "./db";

export const TRACKED_MODELS = [
  "precomputed_events",
  "mv_daily_trend",
  "mv_repo_ranking",
  "mv_event_type_dist",
  "mv_trending_daily_growth",
  "mv_trending_repo_score",
  "mv_trending_score_by_language",
] as const;

export type ModelSize = {
  tableName: string;
  rowCount: number;
  totalBytes: number;
};

export async function getModelSizes(): Promise<ModelSize[]> {
  const { rows } = await readonlyPool.query(
    `select relname as table_name,
            n_live_tup as row_count,
            pg_total_relation_size(relid) as total_bytes
     from pg_stat_user_tables
     where relname = any($1)`,
    [TRACKED_MODELS]
  );

  return rows.map((row) => ({
    tableName: row.table_name,
    rowCount: Number(row.row_count),
    totalBytes: Number(row.total_bytes),
  }));
}
