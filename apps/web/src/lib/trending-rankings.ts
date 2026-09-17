import { readonlyPool } from "./db";

export type TopicRanking = {
  topic: string;
  repoCount: number;
};

export type LanguageRanking = {
  language: string;
  repoCount: number;
};

export async function getTopicRanking(limit = 20): Promise<TopicRanking[]> {
  const { rows } = await readonlyPool.query(
    `select topic, repo_count from trending_topic_ranking order by repo_count desc limit $1`,
    [limit]
  );
  return rows.map((row) => ({ topic: row.topic, repoCount: row.repo_count }));
}

export async function getLanguageRanking(limit = 10): Promise<LanguageRanking[]> {
  const { rows } = await readonlyPool.query(
    `select language, repo_count from trending_language_ranking order by repo_count desc limit $1`,
    [limit]
  );
  return rows.map((row) => ({ language: row.language, repoCount: row.repo_count }));
}
