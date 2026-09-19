import { getRecentPipelineRuns, summarize, type PipelineRun } from "@/lib/pipeline-runs";
import { formatDuration, formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  tone,
  hero,
}: {
  label: string;
  value: string;
  tone?: "success" | "failure";
  hero?: boolean;
}) {
  return (
    <div className={`card ${hero ? "stat-hero" : ""}`}>
      <div className="card-label">{label}</div>
      <div className={`card-value ${tone ? `text-${tone}` : ""}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: PipelineRun["status"] }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export default async function PipelinePage() {
  const runs = await getRecentPipelineRuns();
  const stats = summarize(runs);

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>데이터 수집 파이프라인 현황</h1>
          <p className="subtitle">GitHub Events 수집 → dbt build 워크플로우 실행 현황</p>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard
          hero
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
