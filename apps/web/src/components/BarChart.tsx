type BarChartPoint = {
  label: string;
  value: number;
};

export function BarChart({
  data,
  color = "#6366f1",
  height = 100,
}: {
  data: BarChartPoint[];
  color?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return <p className="empty-state">데이터가 없습니다.</p>;
  }

  const max = Math.max(1, ...data.map((point) => Math.abs(point.value)));
  const barSlot = 100 / data.length;
  const barWidth = barSlot * 0.6;

  return (
    <div className="bar-chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="bar-chart-svg">
        {data.map((point, index) => {
          const barHeight = (Math.abs(point.value) / max) * (height - 4);
          const x = index * barSlot + (barSlot - barWidth) / 2;
          const y = height - barHeight;
          return (
            <rect key={point.label} x={x} y={y} width={barWidth} height={barHeight} fill={color} rx={0.5}>
              <title>{`${point.label}: ${point.value >= 0 ? "+" : ""}${point.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="bar-chart-labels">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}
