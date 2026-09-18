import { getLatestMvRefreshStatus, type MvRefreshStatus } from "@/lib/mv-refresh";
import { triggerMvRefresh } from "@/lib/mv-refresh-action";
import { REFRESHABLE_MVS, REFRESH_COOLDOWN_MS, MV_LABELS } from "@/lib/mv-catalog";
import { getModelSizes } from "@/lib/model-sizes";
import { getModelGraph, layoutModelGraph } from "@/lib/model-graph";
import { formatDuration, formatRelativeTime, formatBytes } from "@/lib/format";
import { RefreshProgress } from "@/components/RefreshProgress";
import { ModelGraph } from "@/components/ModelGraph";

export const dynamic = "force-dynamic";

const MV_ORDER: readonly string[] = REFRESHABLE_MVS;

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

const REFRESH_BANNER: Record<string, { tone: "success" | "error" | "info"; message: string }> = {
  success: { tone: "success", message: "REFRESH를 완료했습니다." },
  error: { tone: "error", message: "REFRESH 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
  cooldown: { tone: "info", message: "너무 잦은 요청입니다. 잠시 후 다시 시도해주세요." },
  locked: { tone: "info", message: "이미 REFRESH가 진행 중입니다." },
};

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [mvStatuses, modelSizes] = await Promise.all([getLatestMvRefreshStatus(), getModelSizes()]);

  const mvStatusByName = new Map(mvStatuses.map((status) => [status.mvName, status]));
  const modelSizeByName = new Map(modelSizes.map((size) => [size.tableName, size]));

  const lastStartedAt = mvStatuses.length
    ? new Date(Math.max(...mvStatuses.map((status) => new Date(status.startedAt).getTime())))
    : null;
  const cooldownRemainingMs = lastStartedAt
    ? REFRESH_COOLDOWN_MS - (Date.now() - lastStartedAt.getTime())
    : 0;
  const cooldownActive = cooldownRemainingMs > 0;

  const refreshBanner = typeof sp.refresh === "string" ? REFRESH_BANNER[sp.refresh] : undefined;

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>증분 모델 REFRESH 현황</h1>
          <p className="subtitle">precomputed_events(incremental) + MV 3종의 최신화 상태</p>
        </div>
        <form action={triggerMvRefresh}>
          <button type="submit" className="btn" disabled={cooldownActive}>
            {cooldownActive ? `전체 REFRESH (약 ${Math.ceil(cooldownRemainingMs / 60000)}분 후 가능)` : "전체 REFRESH"}
          </button>
        </form>
      </header>

      {refreshBanner && (
        <p className={`refresh-banner ${refreshBanner.tone}`}>{refreshBanner.message}</p>
      )}

      <RefreshProgress />

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

      <h2 className="section-title">모델 의존성 그래프</h2>
      <p className="section-caption">
        raw 소스 → staging → marts 순으로, dbt 모델 SQL의 ref()/source() 호출을 그대로 파싱해
        그린 그래프입니다 (수동 갱신 불필요).
      </p>
      <section className="card">
        <ModelGraph layout={layoutModelGraph(getModelGraph())} />
      </section>
    </main>
  );
}
