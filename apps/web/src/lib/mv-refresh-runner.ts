import { batchPool } from "./db";
import { REFRESHABLE_MVS, REFRESH_COOLDOWN_MS } from "./mv-catalog";
import { getLastRefreshStartedAt } from "./mv-refresh";
import {
  getRefreshProgress,
  startRefreshProgress,
  setMvStepState,
  finishRefreshProgress,
} from "./refresh-progress";

export type MvRefreshResult =
  | { status: "locked" }
  | { status: "cooldown"; remainingMs: number }
  | { status: "success" }
  | { status: "error" };

// REFRESH 버튼(Server Action, mv-refresh-action.ts)과 챗봇의 refresh_materialized_views
// 도구가 공통으로 쓰는 핵심 로직. 쿨다운/락 보호장치(ADR-006)가 여기 한 곳에만 있어서
// 어느 진입점으로 들어오든 동일하게 적용된다 — 챗봇이 REFRESH를 반복 요청받아도
// 실제 실행은 5분에 한 번으로 서버가 강제한다(LLM의 "명시적 요청 시에만 호출" 지시는
// 보조 수단일 뿐, 진짜 방어선은 이 함수의 쿨다운/락 체크).
export async function runMvRefresh(): Promise<MvRefreshResult> {
  if (getRefreshProgress().running) {
    return { status: "locked" };
  }

  const lastStartedAt = await getLastRefreshStartedAt();
  if (lastStartedAt) {
    const remainingMs = REFRESH_COOLDOWN_MS - (Date.now() - lastStartedAt.getTime());
    if (remainingMs > 0) {
      return { status: "cooldown", remainingMs };
    }
  }

  startRefreshProgress();
  let failed = false;
  try {
    for (const mv of REFRESHABLE_MVS) {
      setMvStepState(mv, "running");
      try {
        const startedAt = new Date();
        await batchPool.query(`refresh materialized view concurrently ${mv}`);
        const finishedAt = new Date();
        await batchPool.query(
          `insert into mv_refresh_log (mv_name, started_at, finished_at) values ($1, $2, $3)`,
          [mv, startedAt, finishedAt]
        );
        setMvStepState(mv, "done");
      } catch (err) {
        setMvStepState(mv, "error");
        throw err;
      }
    }
  } catch (err) {
    console.error("mv refresh failed", err);
    failed = true;
  } finally {
    finishRefreshProgress(failed);
  }

  return failed ? { status: "error" } : { status: "success" };
}
