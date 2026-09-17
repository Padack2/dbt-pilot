import { readonlyPool } from "./db";

export type TrendingRepo = {
  repoName: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  capturedAt: string;
  observedEvents: number;
  observedStarEvents: number;
  lastObservedAt: string | null;
};

export async function getTrendingRepos(limit = 20): Promise<TrendingRepo[]> {
  const { rows } = await readonlyPool.query(
    `select repo_name, description, stars, forks, language, captured_at,
            observed_events, observed_star_events, last_observed_at
     from trending_repos_with_activity
     order by stars desc
     limit $1`,
    [limit]
  );

  return rows.map((row) => ({
    repoName: row.repo_name,
    description: row.description,
    stars: row.stars,
    forks: row.forks,
    language: row.language,
    capturedAt: row.captured_at,
    observedEvents: row.observed_events,
    observedStarEvents: row.observed_star_events,
    lastObservedAt: row.last_observed_at,
  }));
}
