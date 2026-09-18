import { readonlyPool } from "./db";

export type MvRefreshStatus = {
  mvName: string;
  startedAt: string;
  finishedAt: string;
};

export async function getLatestMvRefreshStatus(): Promise<MvRefreshStatus[]> {
  const { rows } = await readonlyPool.query(
    `select distinct on (mv_name) mv_name, started_at, finished_at
     from mv_refresh_log
     order by mv_name, started_at desc`
  );

  return rows.map((row) => ({
    mvName: row.mv_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

export async function getLastRefreshStartedAt(): Promise<Date | null> {
  const { rows } = await readonlyPool.query(
    `select max(started_at) as last_started_at from mv_refresh_log`
  );
  return rows[0]?.last_started_at ?? null;
}
