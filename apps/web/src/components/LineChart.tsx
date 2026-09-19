"use client";

import { useEffect, useRef, useState } from "react";

type LineChartPoint = {
  label: string;
  value: number;
};

const HEIGHT = 140;
const PADDING_X = 12;
const PADDING_Y = 16;
const CROSSHAIR_COLOR = "#383f4f";
const DOT_RING_COLOR = "#14171f";

export function LineChart({
  data,
  color = "#f2b134",
  unitPrefix = "",
}: {
  data: LineChartPoint[];
  color?: string;
  unitPrefix?: string;
}) {
  const valueFormatter = (value: number) => `${unitPrefix}${value.toLocaleString("ko-KR")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (data.length === 0) {
    return <p className="empty-state">데이터가 없습니다.</p>;
  }

  const values = data.map((d) => d.value);
  const yMin = Math.min(0, ...values);
  const yMax = Math.max(1, ...values);
  const range = Math.max(yMax - yMin, 1);

  const innerWidth = width - PADDING_X * 2;
  const innerHeight = HEIGHT - PADDING_Y * 2;

  const xAt = (i: number) =>
    data.length > 1 ? PADDING_X + (i / (data.length - 1)) * innerWidth : width / 2;
  const yAt = (v: number) => PADDING_Y + innerHeight - ((v - yMin) / range) * innerHeight;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(d.value).toFixed(2)}`)
    .join(" ");

  const areaPath =
    data.length > 1
      ? `${linePath} L ${xAt(data.length - 1).toFixed(2)} ${(HEIGHT - PADDING_Y).toFixed(2)} L ${xAt(0).toFixed(2)} ${(HEIGHT - PADDING_Y).toFixed(2)} Z`
      : "";

  function updateHoverFromClientX(clientX: number, rect: DOMRect) {
    const relX = clientX - rect.left;
    const fraction = data.length > 1 ? relX / rect.width : 0;
    const index = Math.min(data.length - 1, Math.max(0, Math.round(fraction * (data.length - 1))));
    setHoverIndex(index);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    updateHoverFromClientX(event.clientX, event.currentTarget.getBoundingClientRect());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setHoverIndex((prev) => Math.min(data.length - 1, (prev ?? -1) + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setHoverIndex((prev) => Math.max(0, (prev ?? data.length) - 1));
    }
  }

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;
  const hoverFraction = hoverIndex !== null ? xAt(hoverIndex) / width : 0;
  const tooltipAlign = hoverFraction < 0.12 ? "start" : hoverFraction > 0.88 ? "end" : "center";

  return (
    <div
      className="line-chart"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => setHoverIndex((prev) => prev ?? data.length - 1)}
      onBlur={() => setHoverIndex(null)}
    >
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="line-chart-svg"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {areaPath && <path d={areaPath} fill={color} opacity={0.1} stroke="none" />}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.length === 1 && <circle cx={xAt(0)} cy={yAt(data[0].value)} r={4} fill={color} />}
        {hovered && hoverIndex !== null && (
          <>
            <line
              x1={xAt(hoverIndex)}
              x2={xAt(hoverIndex)}
              y1={PADDING_Y}
              y2={HEIGHT - PADDING_Y}
              stroke={CROSSHAIR_COLOR}
              strokeWidth={1}
            />
            <circle
              cx={xAt(hoverIndex)}
              cy={yAt(hovered.value)}
              r={4}
              fill={color}
              stroke={DOT_RING_COLOR}
              strokeWidth={2}
            />
          </>
        )}
      </svg>
      {hovered && hoverIndex !== null && (
        <div className={`line-chart-tooltip align-${tooltipAlign}`} style={{ left: `${hoverFraction * 100}%` }}>
          <div className="line-chart-tooltip-label">{hovered.label}</div>
          <div className="line-chart-tooltip-value">{valueFormatter(hovered.value)}</div>
        </div>
      )}
      <div className="bar-chart-labels">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}
