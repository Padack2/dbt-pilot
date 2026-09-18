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

  return rows.map(mapTrendingRepoRow);
}

// LLM 챗봇의 search_trending_repos 도구 전용 — 이름/설명 키워드나 언어로 필터링해 조회.
export async function searchTrendingRepos(params: {
  query?: string;
  language?: string;
  limit?: number;
}): Promise<TrendingRepo[]> {
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 15);
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.query) {
    values.push(`%${params.query}%`);
    conditions.push(`(repo_name ilike $${values.length} or description ilike $${values.length})`);
  }
  if (params.language) {
    values.push(params.language);
    conditions.push(`language ilike $${values.length}`);
  }

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  values.push(limit);

  const { rows } = await readonlyPool.query(
    `select repo_name, description, stars, forks, language, captured_at,
            observed_events, observed_star_events, last_observed_at
     from trending_repos_with_activity
     ${where}
     order by stars desc
     limit $${values.length}`,
    values
  );

  return rows.map(mapTrendingRepoRow);
}

function mapTrendingRepoRow(row: {
  repo_name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  captured_at: string;
  observed_events: number;
  observed_star_events: number;
  last_observed_at: string | null;
}): TrendingRepo {
  return {
    repoName: row.repo_name,
    description: row.description,
    stars: row.stars,
    forks: row.forks,
    language: row.language,
    capturedAt: row.captured_at,
    observedEvents: row.observed_events,
    observedStarEvents: row.observed_star_events,
    lastObservedAt: row.last_observed_at,
  };
}
