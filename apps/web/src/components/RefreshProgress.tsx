"use client";

import { useEffect, useState } from "react";
import { REFRESHABLE_MVS, MV_LABELS } from "@/lib/mv-catalog";
import type { RefreshProgressState, MvStepState } from "@/lib/refresh-progress";

const STEP_META: Record<MvStepState, { label: string; className: string }> = {
  pending: { label: "대기", className: "pending" },
  running: { label: "진행 중", className: "running" },
  done: { label: "완료", className: "done" },
  error: { label: "실패", className: "error" },
};

export function RefreshProgress() {
  const [progress, setProgress] = useState<RefreshProgressState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/refresh-status", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data: RefreshProgressState = await res.json();
        if (!cancelled) setProgress(data);
      } catch {
        // 폴링 실패는 조용히 무시하고 다음 tick에 재시도
      }
    }

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!progress?.running) return null;

  return (
    <section className="card refresh-progress">
      <div className="card-label">REFRESH 진행 상황</div>
      <ul className="refresh-progress-list">
        {REFRESHABLE_MVS.map((mv) => {
          const step = progress.steps[mv];
          const meta = STEP_META[step];
          return (
            <li key={mv} className={`refresh-progress-item ${meta.className}`}>
              <span className="refresh-progress-dot" />
              <span className="refresh-progress-name">{MV_LABELS[mv]}</span>
              <span className="refresh-progress-status">{meta.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
