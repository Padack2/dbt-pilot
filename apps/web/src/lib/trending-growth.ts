import { readonlyPool } from "./db";

export type DailyGrowth = {
  eventDate: string;
  stars: number;
  forks: number;
  starGrowth: number | null;
  forkGrowth: number | null;
};

export async function getRepoDailyGrowth(repoName: string, days = 14): Promise<DailyGrowth[]> {
  const { rows } = await readonlyPool.query(
    `select event_date::text as event_date, stars, forks, star_growth, fork_growth
     from mv_trending_daily_growth
     where repo_name = $1
     order by event_date desc
     limit $2`,
    [repoName, days]
  );

  return rows
    .map((row) => ({
      eventDate: row.event_date,
      stars: row.stars,
      forks: row.forks,
      starGrowth: row.star_growth,
      forkGrowth: row.fork_growth,
    }))
    .reverse();
}
