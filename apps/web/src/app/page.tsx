import { getRecentPipelineRuns, summarize, type PipelineRun } from "@/lib/pipeline-runs";
import { getLatestMvRefreshStatus, type MvRefreshStatus } from "@/lib/mv-refresh";
import { getTrendingRepos } from "@/lib/trending-repos";
import {
  getAvailableRankingDates,
  getRepoRanking,
  isRankingMetric,
  isRankingLimit,
  RANKING_METRICS,
  RANKING_METRIC_LABELS,
  RANKING_LIMITS,
  type RankingMetric,
} from "@/lib/repo-ranking";

export const dynamic = "force-dynamic";

const MV_LABELS: Record<string, string> = {
  mv_daily_trend: "일별 트렌드",
  mv_repo_ranking: "리포 랭킹",
  mv_event_type_dist: "이벤트 타입 분포",
};
const MV_ORDER = ["mv_daily_trend", "mv_repo_ranking", "mv_event_type_dist"];

function formatDuration(startedAt: string, finishedAt: string): string {
  const seconds = Math.max(
    0,
    Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  );
  return `${seconds}s`;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "failure" }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className={`card-value ${tone ? `text-${tone}` : ""}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: PipelineRun["status"] }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function MvRefreshCard({ mvName, status }: { mvName: string; status: MvRefreshStatus | undefined }) {
  return (
    <div className="card">
      <div className="card-label">{MV_LABELS[mvName] ?? mvName}</div>
      <div className="card-value">{status ? formatRelativeTime(status.startedAt) : "미실행"}</div>
      {status && (
        <div className="card-sub">{formatDuration(status.startedAt, status.finishedAt)} 소요</div>
      )}
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const rankingDates = await getAvailableRankingDates();
  const selectedDate = typeof sp.date === "string" && rankingDates.includes(sp.date)
    ? sp.date
    : rankingDates[0];

  const selectedMetric: RankingMetric =
    typeof sp.metric === "string" && isRankingMetric(sp.metric) ? sp.metric : "total_activity";

  const parsedLimit = typeof sp.limit === "string" ? parseInt(sp.limit, 10) : NaN;
  const selectedLimit = isRankingLimit(parsedLimit) ? parsedLimit : 10;

  const [runs, mvStatuses, ranking, trendingRepos] = await Promise.all([
    getRecentPipelineRuns(),
    getLatestMvRefreshStatus(),
    selectedDate ? getRepoRanking(selectedDate, selectedMetric, selectedLimit) : Promise.resolve([]),
    getTrendingRepos(),
  ]);

  const stats = summarize(runs);
  const mvStatusByName = new Map(mvStatuses.map((status) => [status.mvName, status]));

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>dbt Pilot</h1>
          <p className="subtitle">GitHub Events 파이프라인 실행 현황</p>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard
          label="마지막 실행"
          value={stats.lastRun ? formatRelativeTime(stats.lastRun.startedAt) : "-"}
          tone={stats.lastRun?.status}
        />
        <StatCard
          label="성공률"
          value={stats.successRate !== null ? `${stats.successRate.toFixed(0)}%` : "-"}
        />
        <StatCard
          label="평균 소요 시간"
          value={stats.avgDurationSeconds !== null ? `${stats.avgDurationSeconds.toFixed(0)}s` : "-"}
        />
        <StatCard
          label="수집 row 합계"
          value={stats.totalRowsIngested.toLocaleString("ko-KR")}
        />
      </section>

      <section className="run-timeline" title="최근 실행 순 (좌: 과거 → 우: 최신)">
        {[...runs].reverse().map((run) => (
          <div
            key={run.id}
            className={`run-timeline-item ${run.status}`}
            title={`${new Date(run.startedAt).toLocaleString("ko-KR")} · ${run.status}`}
          />
        ))}
      </section>

      <h2 className="section-title">MV 리프레시 현황</h2>
      <section className="stats-grid">
        {MV_ORDER.map((mvName) => (
          <MvRefreshCard key={mvName} mvName={mvName} status={mvStatusByName.get(mvName)} />
        ))}
      </section>

      <h2 className="section-title">급상승 레포 (ADR-004)</h2>
      {trendingRepos.length === 0 ? (
        <section className="card">
          <p className="empty-state">
            아직 trending_repos_snapshot에 데이터가 없습니다. trending.yml 워크플로우를 먼저
            실행해주세요.
          </p>
        </section>
      ) : (
        <section className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Repo</th>
                <th>설명</th>
                <th>Language</th>
                <th>Star</th>
                <th>Fork</th>
                <th>우리 샘플 관측</th>
                <th>스냅샷 시각</th>
              </tr>
            </thead>
            <tbody>
              {trendingRepos.map((repo) => (
                <tr key={repo.repoName}>
                  <td>{repo.repoName}</td>
                  <td className="truncate-cell" title={repo.description ?? undefined}>
                    {repo.description ? repo.description.slice(0, 60) : "-"}
                  </td>
                  <td>{repo.language ?? "-"}</td>
                  <td>{repo.stars}</td>
                  <td>{repo.forks}</td>
                  <td>
                    {repo.observedEvents > 0 ? (
                      <span className="badge badge-success">{repo.observedEvents}건</span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{formatRelativeTime(repo.capturedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <h2 className="section-title">리포 랭킹 Top N</h2>
      <section className="card filter-card">
        <form className="filter-form">
          <div className="field">
            <label htmlFor="date">날짜</label>
            <select id="date" name="date" defaultValue={selectedDate}>
              {rankingDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="metric">기준</label>
            <select id="metric" name="metric" defaultValue={selectedMetric}>
              {RANKING_METRICS.map((metric) => (
                <option key={metric} value={metric}>
                  {RANKING_METRIC_LABELS[metric]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="limit">개수</label>
            <select id="limit" name="limit" defaultValue={selectedLimit}>
              {RANKING_LIMITS.map((limit) => (
                <option key={limit} value={limit}>
                  Top {limit}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn">
            조회
          </button>
        </form>
      </section>

      {rankingDates.length === 0 ? (
        <section className="card">
          <p className="empty-state">아직 mv_repo_ranking에 데이터가 없습니다.</p>
        </section>
      ) : (
        <section className="card table-card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Repo</th>
                <th>Star</th>
                <th>Fork</th>
                <th>Push</th>
                <th>전체 활동</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row, index) => (
                <tr key={row.repoName}>
                  <td>{index + 1}</td>
                  <td>{row.repoName}</td>
                  <td>{row.starCount}</td>
                  <td>{row.forkCount}</td>
                  <td>{row.pushCount}</td>
                  <td>{row.totalActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <h2 className="section-title">파이프라인 실행 이력</h2>
      <section className="card table-card">
        <table>
          <thead>
            <tr>
              <th>시작 시각</th>
              <th>상태</th>
              <th>소요 시간</th>
              <th>수집 row</th>
              <th>에러</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{new Date(run.startedAt).toLocaleString("ko-KR")}</td>
                <td>
                  <StatusBadge status={run.status} />
                </td>
                <td>{formatDuration(run.startedAt, run.finishedAt)}</td>
                <td>{run.rowsIngested ?? "-"}</td>
                <td className="truncate-cell" title={run.errorMessage ?? undefined}>
                  {run.errorMessage ? run.errorMessage.slice(0, 60) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
