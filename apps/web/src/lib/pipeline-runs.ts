import { readonlyPool } from "./db";

export type PipelineRun = {
  id: number;
  startedAt: string;
  finishedAt: string;
  status: "success" | "failure";
  rowsIngested: number | null;
  errorMessage: string | null;
  githubRunId: string | null;
};

export type PipelineStats = {
  lastRun: PipelineRun | null;
  successRate: number | null;
  avgDurationSeconds: number | null;
  totalRowsIngested: number;
};

export async function getRecentPipelineRuns(limit = 20): Promise<PipelineRun[]> {
  const { rows } = await readonlyPool.query(
    `select id, started_at, finished_at, status, rows_ingested, error_message, github_run_id
     from pipeline_runs
     order by started_at desc
     limit $1`,
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    rowsIngested: row.rows_ingested,
    errorMessage: row.error_message,
    githubRunId: row.github_run_id,
  }));
}

export function summarize(runs: PipelineRun[]): PipelineStats {
  if (runs.length === 0) {
    return { lastRun: null, successRate: null, avgDurationSeconds: null, totalRowsIngested: 0 };
  }

  const successCount = runs.filter((run) => run.status === "success").length;
  const totalDurationSeconds = runs.reduce(
    (sum, run) =>
      sum + (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
    0
  );

  return {
    lastRun: runs[0],
    successRate: (successCount / runs.length) * 100,
    avgDurationSeconds: totalDurationSeconds / runs.length,
    totalRowsIngested: runs.reduce((sum, run) => sum + (run.rowsIngested ?? 0), 0),
  };
}
