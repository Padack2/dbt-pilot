import { REFRESHABLE_MVS, type RefreshableMv } from "./mv-catalog";

// REFRESH 진행 상황을 폴링으로 보여주기 위한 프로세스 인메모리 상태.
// DB에 매 단계 쓰는 대신 메모리에만 두는 이유: 매 단계 업데이트해도 DB 부하가 없고,
// 이 상태는 어차피 "지금 이 순간의 진행률" 같은 휘발성 정보라 영속화할 필요가 없음.
// (ADR-007과 동일한 한계: 서버리스 다중 인스턴스에서는 인스턴스별로 분리된 메모리라
//  폴링 요청이 REFRESH를 실행 중인 인스턴스와 다른 인스턴스로 갈 경우 진행률이 보이지 않을 수 있음)

export type MvStepState = "pending" | "running" | "done" | "error";

export type RefreshProgressState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  failed: boolean;
  steps: Record<RefreshableMv, MvStepState>;
};

function idleSteps(): Record<RefreshableMv, MvStepState> {
  return Object.fromEntries(REFRESHABLE_MVS.map((mv) => [mv, "pending"])) as Record<
    RefreshableMv,
    MvStepState
  >;
}

declare global {
  var _refreshProgress: RefreshProgressState | undefined;
}

function state(): RefreshProgressState {
  if (!global._refreshProgress) {
    global._refreshProgress = {
      running: false,
      startedAt: null,
      finishedAt: null,
      failed: false,
      steps: idleSteps(),
    };
  }
  return global._refreshProgress;
}

export function getRefreshProgress(): RefreshProgressState {
  return state();
}

export function startRefreshProgress() {
  global._refreshProgress = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    failed: false,
    steps: idleSteps(),
  };
}

export function setMvStepState(mv: RefreshableMv, step: MvStepState) {
  state().steps[mv] = step;
}

export function finishRefreshProgress(failed: boolean) {
  const s = state();
  s.running = false;
  s.finishedAt = new Date().toISOString();
  s.failed = failed;
}
