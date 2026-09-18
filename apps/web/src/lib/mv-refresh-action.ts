"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { batchPool } from "./db";
import { REFRESHABLE_MVS, REFRESH_COOLDOWN_MS } from "./mv-catalog";
import { getLastRefreshStartedAt } from "./mv-refresh";
import { getRefreshProgress, startRefreshProgress, setMvStepState, finishRefreshProgress } from "./refresh-progress";

export async function triggerMvRefresh() {
  if (getRefreshProgress().running) {
    redirect("/models?refresh=locked");
  }

  const lastStartedAt = await getLastRefreshStartedAt();
  if (lastStartedAt && Date.now() - lastStartedAt.getTime() < REFRESH_COOLDOWN_MS) {
    redirect("/models?refresh=cooldown");
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

  revalidatePath("/models");
  redirect(failed ? "/models?refresh=error" : "/models?refresh=success");
}
