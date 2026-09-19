"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GRAPH_NODE_WIDTH,
  GRAPH_NODE_HEIGHT,
  type ModelGraphLayout,
  type ModelNodeType,
} from "@/lib/model-graph-layout";

const TYPE_META: Record<ModelNodeType, { label: string; color: string }> = {
  source: { label: "원본 테이블", color: "#8b91a5" },
  view: { label: "View", color: "#38bdf8" },
  incremental: { label: "Table / Incremental", color: "#f2b134" },
  materialized_view: { label: "Materialized View", color: "#9085e9" },
};

const EDGE_COLOR = "#3a4152";
const SIM_STEP_DURATION_MS = 2000;

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const x1 = from.x + GRAPH_NODE_WIDTH;
  const y1 = from.y + GRAPH_NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + GRAPH_NODE_HEIGHT / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SimStatus = "pending" | "running" | "done";

export function ModelGraph({ layout }: { layout: ModelGraphLayout }) {
  const nodeByName = new Map(layout.nodes.map((n) => [n.name, n]));

  const levels = useMemo(() => {
    const byLevel = new Map<number, string[]>();
    for (const node of layout.nodes) {
      const names = byLevel.get(node.level) ?? [];
      names.push(node.name);
      byLevel.set(node.level, names);
    }
    return [...byLevel.entries()].sort(([a], [b]) => a - b).map(([, names]) => names);
  }, [layout.nodes]);

  const [simStatus, setSimStatus] = useState<Record<string, SimStatus> | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function runSimulation() {
    if (simRunning) return;
    setSimRunning(true);
    setSimStatus(Object.fromEntries(layout.nodes.map((node) => [node.name, "pending" as SimStatus])));

    for (let i = 0; i < levels.length; i++) {
      setSimStep(i + 1);
      setSimStatus((prev) => {
        const next = { ...(prev ?? {}) };
        for (const name of levels[i]) next[name] = "running";
        return next;
      });
      await sleep(SIM_STEP_DURATION_MS);
      if (!mountedRef.current) return;
      setSimStatus((prev) => {
        const next = { ...(prev ?? {}) };
        for (const name of levels[i]) next[name] = "done";
        return next;
      });
    }

    await sleep(700);
    if (!mountedRef.current) return;
    setSimStatus(null);
    setSimRunning(false);
    setSimStep(0);
  }

  return (
    <div>
      <div className="model-graph-toolbar">
        <div className="model-graph-legend">
          {(Object.entries(TYPE_META) as [ModelNodeType, { label: string; color: string }][]).map(
            ([type, meta]) => (
              <span key={type} className="model-graph-legend-item">
                <span className="model-graph-dot" style={{ background: meta.color }} />
                {meta.label}
              </span>
            )
          )}
        </div>
        <button type="button" className="btn-secondary" onClick={runSimulation} disabled={simRunning}>
          {simRunning ? `시뮬레이션 진행 중 (${simStep}/${levels.length}단계)` : "REFRESH 시뮬레이션"}
        </button>
      </div>
      <div className="model-graph-scroll">
        <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
          <defs>
            <marker
              id="model-graph-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR} />
            </marker>
          </defs>

          {layout.edges.map((edge, index) => {
            const from = nodeByName.get(edge.from);
            const to = nodeByName.get(edge.to);
            if (!from || !to) return null;
            return (
              <path
                key={`${edge.from}->${edge.to}-${index}`}
                d={edgePath(from, to)}
                fill="none"
                stroke={EDGE_COLOR}
                strokeWidth={1.5}
                markerEnd="url(#model-graph-arrow)"
              />
            );
          })}

          {layout.nodes.map((node) => {
            const status = simStatus?.[node.name];
            return (
              <foreignObject
                key={node.name}
                x={node.x}
                y={node.y}
                width={GRAPH_NODE_WIDTH}
                height={GRAPH_NODE_HEIGHT}
              >
                <div
                  className={`model-graph-node ${status ? `sim-${status}` : ""}`}
                  title={node.name}
                  style={{ borderLeftColor: TYPE_META[node.type].color }}
                >
                  {node.name}
                </div>
              </foreignObject>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
