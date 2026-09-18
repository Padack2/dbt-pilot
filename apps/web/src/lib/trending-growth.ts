import { readonlyPool } from "./db";

export type DailyGrowth = {
  eventDate: string;
  stars: number;
  forks: number;
  starGrowth: number | null;
  forkGrowth: number | null;
};

export type TotalDailyGrowth = {
  eventDate: string;
  repoCount: number;
  totalStarGrowth: number;
  totalForkGrowth: number;
};

// 레포 하나가 아니라 추적 중인 급상승 레포 전체를 합산한 일별 증가량.
export async function getTotalDailyGrowth(days = 14): Promise<TotalDailyGrowth[]> {
  const { rows } = await readonlyPool.query(
    `select event_date::text as event_date,
            count(*) as repo_count,
            sum(coalesce(star_growth, 0)) as total_star_growth,
            sum(coalesce(fork_growth, 0)) as total_fork_growth
     from mv_trending_daily_growth
     where event_date >= current_date - $1::integer
     group by event_date
     order by event_date`,
    [days]
  );

  return rows.map((row) => ({
    eventDate: row.event_date,
    repoCount: Number(row.repo_count),
    totalStarGrowth: Number(row.total_star_growth),
    totalForkGrowth: Number(row.total_fork_growth),
  }));
}

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
