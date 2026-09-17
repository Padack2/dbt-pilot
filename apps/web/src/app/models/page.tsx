import { getLatestMvRefreshStatus, type MvRefreshStatus } from "@/lib/mv-refresh";
import { getModelSizes } from "@/lib/model-sizes";
import { formatDuration, formatRelativeTime, formatBytes } from "@/lib/format";

export const dynamic = "force-dynamic";

const MV_LABELS: Record<string, string> = {
  mv_daily_trend: "일별 트렌드",
  mv_repo_ranking: "리포 랭킹",
  mv_event_type_dist: "이벤트 타입 분포",
  mv_trending_daily_growth: "급상승 레포 일별 성장",
  mv_trending_repo_score: "급상승 레포 점수",
  mv_trending_score_by_language: "언어별 점수 집계",
};
const MV_ORDER = [
  "mv_daily_trend",
  "mv_repo_ranking",
  "mv_event_type_dist",
  "mv_trending_daily_growth",
  "mv_trending_repo_score",
  "mv_trending_score_by_language",
];

const MODEL_LABELS: Record<string, string> = {
  precomputed_events: "선계산 테이블",
  ...MV_LABELS,
};
const MODEL_ORDER = ["precomputed_events", ...MV_ORDER];

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

export default async function ModelsPage() {
  const [mvStatuses, modelSizes] = await Promise.all([getLatestMvRefreshStatus(), getModelSizes()]);

  const mvStatusByName = new Map(mvStatuses.map((status) => [status.mvName, status]));
  const modelSizeByName = new Map(modelSizes.map((size) => [size.tableName, size]));

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>증분 모델 REFRESH 현황</h1>
          <p className="subtitle">precomputed_events(incremental) + MV 3종의 최신화 상태</p>
        </div>
      </header>

      <h2 className="section-title">MV 리프레시 현황</h2>
      <section className="stats-grid">
        {MV_ORDER.map((mvName) => (
          <MvRefreshCard key={mvName} mvName={mvName} status={mvStatusByName.get(mvName)} />
        ))}
      </section>

      <h2 className="section-title">모델 용량 / Row 수</h2>
      <section className="card table-card">
        <table>
          <thead>
            <tr>
              <th>모델</th>
              <th>Row 수</th>
              <th>용량</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_ORDER.map((tableName) => {
              const size = modelSizeByName.get(tableName);
              return (
                <tr key={tableName}>
                  <td>{MODEL_LABELS[tableName] ?? tableName}</td>
                  <td>{size ? size.rowCount.toLocaleString("ko-KR") : "-"}</td>
                  <td>{size ? formatBytes(size.totalBytes) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="table-note">Row 수는 Postgres 통계(n_live_tup) 기준 추정치입니다.</p>
      </section>
    </main>
  );
}
