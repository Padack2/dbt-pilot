import { readonlyPool } from "./db";

export type RepoScoreRow = {
  repoName: string;
  language: string | null;
  stars: number;
  forks: number;
  starGrowth: number;
  forkGrowth: number;
  score: number;
};

export type LanguageScoreRow = {
  language: string;
  repoCount: number;
  totalScore: number;
  avgScore: number;
  maxScore: number;
};

export async function getRepoScoreRanking(limit = 10): Promise<RepoScoreRow[]> {
  const { rows } = await readonlyPool.query(
    `select repo_name, language, stars, forks, star_growth, fork_growth, score
     from mv_trending_repo_score
     order by score desc
     limit $1`,
    [limit]
  );
  return rows.map((row) => ({
    repoName: row.repo_name,
    language: row.language,
    stars: row.stars,
    forks: row.forks,
    starGrowth: row.star_growth,
    forkGrowth: row.fork_growth,
    score: Number(row.score),
  }));
}

export async function getLanguageScoreRanking(limit = 10): Promise<LanguageScoreRow[]> {
  const { rows } = await readonlyPool.query(
    `select language, repo_count, total_score, avg_score, max_score
     from mv_trending_score_by_language
     order by total_score desc
     limit $1`,
    [limit]
  );
  return rows.map((row) => ({
    language: row.language,
    repoCount: row.repo_count,
    totalScore: Number(row.total_score),
    avgScore: Number(row.avg_score),
    maxScore: Number(row.max_score),
  }));
}
