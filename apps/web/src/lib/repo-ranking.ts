import { readonlyPool } from "./db";

export const RANKING_METRICS = ["total_activity", "star_count", "fork_count", "push_count"] as const;
export type RankingMetric = (typeof RANKING_METRICS)[number];

export const RANKING_METRIC_LABELS: Record<RankingMetric, string> = {
  total_activity: "전체 이벤트",
  star_count: "Star 이벤트",
  fork_count: "Fork 이벤트",
  push_count: "Push 이벤트",
};

export const RANKING_LIMITS = [5, 10, 20, 50] as const;
export type RankingLimit = (typeof RANKING_LIMITS)[number];

export function isRankingMetric(value: string): value is RankingMetric {
  return (RANKING_METRICS as readonly string[]).includes(value);
}

export function isRankingLimit(value: number): value is RankingLimit {
  return (RANKING_LIMITS as readonly number[]).includes(value);
}

export type RepoRankingRow = {
  repoName: string;
  starCount: number;
  forkCount: number;
  pushCount: number;
  totalActivity: number;
  isTrending: boolean;
};

export async function getAvailableRankingDates(limit = 14): Promise<string[]> {
  const { rows } = await readonlyPool.query(
    `select distinct event_date::text as event_date
     from mv_repo_ranking
     order by event_date desc
     limit $1`,
    [limit]
  );
  return rows.map((row) => row.event_date);
}

export async function getRepoRanking(
  date: string,
  metric: RankingMetric,
  limit: RankingLimit
): Promise<RepoRankingRow[]> {
  // metric은 컬럼명이라 바인드 파라미터로 넘길 수 없어 화이트리스트(RANKING_METRICS) 검증을 거친 값만 여기 도달함
  const { rows } = await readonlyPool.query(
    `select r.repo_name, r.star_count, r.fork_count, r.push_count, r.total_activity,
            exists(
              select 1 from trending_repos_snapshot t where t.repo_name = r.repo_name
            ) as is_trending
     from mv_repo_ranking r
     where r.event_date = $1
     order by r.${metric} desc
     limit $2`,
    [date, limit]
  );

  return rows.map((row) => ({
    repoName: row.repo_name,
    starCount: row.star_count,
    forkCount: row.fork_count,
    pushCount: row.push_count,
    totalActivity: row.total_activity,
    isTrending: row.is_trending,
  }));
}
