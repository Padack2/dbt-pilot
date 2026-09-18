import { readonlyPool } from "./db";

export type DailyEventCount = {
  eventDate: string;
  totalEvents: number;
  byType: { type: string; count: number }[];
};

// mv_daily_trend(event_date, type별 집계)를 날짜별로 묶어 총합까지 계산.
// 챗봇의 get_daily_event_counts 도구 전용 — "어제/오늘 각각 몇 건" 같은 일자별 질문에 대응.
export async function getDailyEventCounts(days = 7): Promise<DailyEventCount[]> {
  const { rows } = await readonlyPool.query(
    `select event_date::text as event_date, type, event_count
     from mv_daily_trend
     where event_date >= current_date - $1::integer
     order by event_date desc`,
    [days]
  );

  const byDate = new Map<string, DailyEventCount>();
  for (const row of rows) {
    const entry: DailyEventCount = byDate.get(row.event_date) ?? {
      eventDate: row.event_date,
      totalEvents: 0,
      byType: [],
    };
    entry.totalEvents += Number(row.event_count);
    entry.byType.push({ type: row.type, count: Number(row.event_count) });
    byDate.set(row.event_date, entry);
  }

  return [...byDate.values()].sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1));
}

export type RepoGrowthRanking = {
  repoName: string;
  eventDate: string;
  stars: number;
  forks: number;
  starGrowth: number;
  forkGrowth: number;
  totalGrowth: number;
};

// mv_trending_daily_growth를 특정 날짜 기준으로 랭킹. 챗봇의 get_daily_growth_ranking 도구 전용
// — "어제 제일 성과 낮은/좋은 레포" 같은 날짜 특정 랭킹 질문에 대응.
export async function getRepoGrowthRanking(params: {
  date?: string; // 'YYYY-MM-DD', 생략 시 어제
  order?: "worst" | "best";
  limit?: number;
}): Promise<RepoGrowthRanking[]> {
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 20);
  // "best"/"worst" 둘 중 하나로만 분기되는 고정 리터럴이라 SQL 인젝션 경로 없음
  // (사용자 입력 문자열이 SQL 텍스트로 직접 흘러들어가지 않음).
  const orderDirection = params.order === "best" ? "desc" : "asc";

  const { rows } = await readonlyPool.query(
    `select repo_name, event_date::text as event_date, stars, forks,
            coalesce(star_growth, 0) as star_growth,
            coalesce(fork_growth, 0) as fork_growth
     from mv_trending_daily_growth
     where event_date = coalesce($1::date, current_date - 1)
     order by (coalesce(star_growth, 0) + coalesce(fork_growth, 0)) ${orderDirection}
     limit $2`,
    [params.date ?? null, limit]
  );

  return rows.map((row) => ({
    repoName: row.repo_name,
    eventDate: row.event_date,
    stars: row.stars,
    forks: row.forks,
    starGrowth: row.star_growth,
    forkGrowth: row.fork_growth,
    totalGrowth: row.star_growth + row.fork_growth,
  }));
}
