import { readonlyPool } from "./db";

export const PRECOMPUTED_EVENTS_PAGE_SIZE = 50;

export type PrecomputedEvent = {
  eventId: string;
  type: string;
  actorLogin: string;
  repoName: string;
  eventDate: string;
  eventHour: number;
  createdAt: string;
};

export async function getPrecomputedEventTypes(): Promise<string[]> {
  const { rows } = await readonlyPool.query(
    `select distinct type from precomputed_events order by type`
  );
  return rows.map((row) => row.type);
}

export async function getAvailablePrecomputedDates(limit = 14): Promise<string[]> {
  const { rows } = await readonlyPool.query(
    `select distinct event_date::text as event_date
     from precomputed_events
     order by event_date desc
     limit $1`,
    [limit]
  );
  return rows.map((row) => row.event_date);
}

export async function getPrecomputedEvents(
  filter: { type?: string; repoName?: string; eventDate?: string },
  offset: number
): Promise<PrecomputedEvent[]> {
  const { rows } = await readonlyPool.query(
    `select event_id, type, actor_login, repo_name, event_date::text as event_date, event_hour, created_at
     from precomputed_events
     where ($1::text is null or type = $1)
       and ($2::text is null or repo_name ilike '%' || $2 || '%')
       and ($3::date is null or event_date = $3::date)
     order by created_at desc
     limit $4 offset $5`,
    [filter.type || null, filter.repoName || null, filter.eventDate || null, PRECOMPUTED_EVENTS_PAGE_SIZE, offset]
  );

  return rows.map((row) => ({
    eventId: row.event_id,
    type: row.type,
    actorLogin: row.actor_login,
    repoName: row.repo_name,
    eventDate: row.event_date,
    eventHour: row.event_hour,
    createdAt: row.created_at,
  }));
}
