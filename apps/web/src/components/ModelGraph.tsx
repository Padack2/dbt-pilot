import { GRAPH_NODE_WIDTH, GRAPH_NODE_HEIGHT, type ModelGraphLayout, type ModelNodeType } from "@/lib/model-graph";

const TYPE_META: Record<ModelNodeType, { label: string; color: string }> = {
  source: { label: "원본 테이블", color: "#8b93a7" },
  view: { label: "View", color: "#38bdf8" },
  incremental: { label: "Table / Incremental", color: "#facc15" },
  materialized_view: { label: "Materialized View", color: "#6366f1" },
};

const EDGE_COLOR = "#4b5568";

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const x1 = from.x + GRAPH_NODE_WIDTH;
  const y1 = from.y + GRAPH_NODE_HEIGHT / 2;
  const x2 = to.x;
  const y2 = to.y + GRAPH_NODE_HEIGHT / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function ModelGraph({ layout }: { layout: ModelGraphLayout }) {
  const nodeByName = new Map(layout.nodes.map((n) => [n.name, n]));

  return (
    <div>
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

          {layout.nodes.map((node) => (
            <foreignObject
              key={node.name}
              x={node.x}
              y={node.y}
              width={GRAPH_NODE_WIDTH}
              height={GRAPH_NODE_HEIGHT}
            >
              <div className="model-graph-node" title={node.name} style={{ borderLeftColor: TYPE_META[node.type].color }}>
                {node.name}
              </div>
            </foreignObject>
          ))}
        </svg>
      </div>
    </div>
  );
}
