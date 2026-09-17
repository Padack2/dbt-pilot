import { readonlyPool } from "./db";

export const RAW_EVENTS_PAGE_SIZE = 50;

export type RawEvent = {
  eventId: string;
  type: string;
  actorLogin: string;
  repoName: string;
  createdAt: string;
};

export async function getRawEventTypes(): Promise<string[]> {
  const { rows } = await readonlyPool.query(`select distinct type from raw_events order by type`);
  return rows.map((row) => row.type);
}

export async function getRawEvents(
  filter: { type?: string; repoName?: string },
  offset: number
): Promise<RawEvent[]> {
  const { rows } = await readonlyPool.query(
    `select event_id, type, actor_login, repo_name, created_at
     from raw_events
     where ($1::text is null or type = $1)
       and ($2::text is null or repo_name ilike '%' || $2 || '%')
     order by created_at desc
     limit $3 offset $4`,
    [filter.type || null, filter.repoName || null, RAW_EVENTS_PAGE_SIZE, offset]
  );

  return rows.map((row) => ({
    eventId: row.event_id,
    type: row.type,
    actorLogin: row.actor_login,
    repoName: row.repo_name,
    createdAt: row.created_at,
  }));
}
