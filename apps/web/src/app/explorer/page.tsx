import Link from "next/link";
import { RepoLink } from "@/components/RepoLink";
import {
  getRawEventTypes,
  getRawEvents,
  RAW_EVENTS_PAGE_SIZE,
} from "@/lib/raw-events";
import {
  getPrecomputedEventTypes,
  getAvailablePrecomputedDates,
  getPrecomputedEvents,
  PRECOMPUTED_EVENTS_PAGE_SIZE,
} from "@/lib/precomputed-events";

export const dynamic = "force-dynamic";

function buildQuery(current: Record<string, string | string[] | undefined>, overrides: Record<string, string>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (typeof value === "string" && value !== "") usp.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === "") {
      usp.delete(key);
    } else {
      usp.set(key, value);
    }
  }
  const qs = usp.toString();
  return qs ? `/explorer?${qs}` : "/explorer";
}

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const rawType = typeof sp.raw_type === "string" ? sp.raw_type : "";
  const rawRepo = typeof sp.raw_repo === "string" ? sp.raw_repo : "";
  const rawOffset = typeof sp.raw_offset === "string" ? parseInt(sp.raw_offset, 10) || 0 : 0;

  const pcType = typeof sp.pc_type === "string" ? sp.pc_type : "";
  const pcRepo = typeof sp.pc_repo === "string" ? sp.pc_repo : "";
  const pcDate = typeof sp.pc_date === "string" ? sp.pc_date : "";
  const pcOffset = typeof sp.pc_offset === "string" ? parseInt(sp.pc_offset, 10) || 0 : 0;

  const [rawTypes, rawEvents, pcTypes, pcDates, pcEvents] = await Promise.all([
    getRawEventTypes(),
    getRawEvents({ type: rawType, repoName: rawRepo }, rawOffset),
    getPrecomputedEventTypes(),
    getAvailablePrecomputedDates(),
    getPrecomputedEvents({ type: pcType, repoName: pcRepo, eventDate: pcDate }, pcOffset),
  ]);

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>데이터 조회</h1>
          <p className="subtitle">raw_events(로우 데이터) / precomputed_events(증분 모델) 직접 조회</p>
        </div>
      </header>

      <h2 className="section-title">raw_events</h2>
      <section className="card filter-card">
        <form className="filter-form">
          <div className="field">
            <label htmlFor="raw_type">이벤트 타입</label>
            <select id="raw_type" name="raw_type" defaultValue={rawType}>
              <option value="">전체</option>
              {rawTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="raw_repo">레포명 검색</label>
            <input id="raw_repo" name="raw_repo" type="text" defaultValue={rawRepo} placeholder="owner/repo" />
          </div>
          <button type="submit" className="btn">
            조회
          </button>
        </form>
      </section>

      <section className="card table-card">
        {rawEvents.length === 0 ? (
          <p className="empty-state">조건에 맞는 이벤트가 없습니다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>발생 시각</th>
                <th>타입</th>
                <th>Actor</th>
                <th>Repo</th>
              </tr>
            </thead>
            <tbody>
              {rawEvents.map((event) => (
                <tr key={event.eventId}>
                  <td>{new Date(event.createdAt).toLocaleString("ko-KR")}</td>
                  <td>{event.type}</td>
                  <td>{event.actorLogin}</td>
                  <td>
                    <RepoLink repoName={event.repoName} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pagination">
          <Link
            href={buildQuery(sp, { raw_offset: String(Math.max(0, rawOffset - RAW_EVENTS_PAGE_SIZE)) })}
            className={`btn-secondary ${rawOffset <= 0 ? "disabled" : ""}`}
          >
            이전
          </Link>
          <Link
            href={buildQuery(sp, { raw_offset: String(rawOffset + RAW_EVENTS_PAGE_SIZE) })}
            className={`btn-secondary ${rawEvents.length < RAW_EVENTS_PAGE_SIZE ? "disabled" : ""}`}
          >
            다음
          </Link>
        </div>
      </section>

      <h2 className="section-title">precomputed_events</h2>
      <section className="card filter-card">
        <form className="filter-form">
          <div className="field">
            <label htmlFor="pc_type">이벤트 타입</label>
            <select id="pc_type" name="pc_type" defaultValue={pcType}>
              <option value="">전체</option>
              {pcTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pc_date">날짜</label>
            <select id="pc_date" name="pc_date" defaultValue={pcDate}>
              <option value="">전체</option>
              {pcDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pc_repo">레포명 검색</label>
            <input id="pc_repo" name="pc_repo" type="text" defaultValue={pcRepo} placeholder="owner/repo" />
          </div>
          <button type="submit" className="btn">
            조회
          </button>
        </form>
      </section>

      <section className="card table-card">
        {pcEvents.length === 0 ? (
          <p className="empty-state">조건에 맞는 이벤트가 없습니다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>발생 시각</th>
                <th>날짜</th>
                <th>시(hour)</th>
                <th>타입</th>
                <th>Actor</th>
                <th>Repo</th>
              </tr>
            </thead>
            <tbody>
              {pcEvents.map((event) => (
                <tr key={event.eventId}>
                  <td>{new Date(event.createdAt).toLocaleString("ko-KR")}</td>
                  <td>{event.eventDate}</td>
                  <td>{event.eventHour}</td>
                  <td>{event.type}</td>
                  <td>{event.actorLogin}</td>
                  <td>
                    <RepoLink repoName={event.repoName} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="pagination">
          <Link
            href={buildQuery(sp, { pc_offset: String(Math.max(0, pcOffset - PRECOMPUTED_EVENTS_PAGE_SIZE)) })}
            className={`btn-secondary ${pcOffset <= 0 ? "disabled" : ""}`}
          >
            이전
          </Link>
          <Link
            href={buildQuery(sp, { pc_offset: String(pcOffset + PRECOMPUTED_EVENTS_PAGE_SIZE) })}
            className={`btn-secondary ${pcEvents.length < PRECOMPUTED_EVENTS_PAGE_SIZE ? "disabled" : ""}`}
          >
            다음
          </Link>
        </div>
      </section>
    </main>
  );
}
