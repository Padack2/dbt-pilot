// fs/path 같은 Node 전용 모듈을 import하지 않는다 — ModelGraph 컴포넌트(클라이언트)가
// 시뮬레이션 애니메이션을 위해 이 파일을 직접 import하므로, 여기 섞이면 클라이언트 번들이 깨진다.
// dbt 모델 SQL을 실제로 파싱하는 getModelGraph()는 lib/model-graph.ts(서버 전용)에 있다.

export type ModelNodeType = "source" | "view" | "incremental" | "materialized_view";

export type ModelNode = {
  name: string;
  type: ModelNodeType;
};

export type ModelEdge = {
  from: string;
  to: string;
};

export type ModelGraph = {
  nodes: ModelNode[];
  edges: ModelEdge[];
};

export type PositionedNode = ModelNode & { x: number; y: number; level: number };

export type ModelGraphLayout = {
  nodes: PositionedNode[];
  edges: ModelEdge[];
  width: number;
  height: number;
};

export const GRAPH_NODE_WIDTH = 150;
export const GRAPH_NODE_HEIGHT = 44;
const COLUMN_GAP = 40;
const ROW_GAP = 20;
const PADDING = 20;

export function layoutModelGraph(graph: ModelGraph): ModelGraphLayout {
  const level = new Map<string, number>();
  for (const node of graph.nodes) level.set(node.name, 0);

  // DAG이므로 노드 개수만큼 반복하면 반드시 고정점(모든 edge가 from보다 to가 큰 상태)에 수렴한다.
  for (let i = 0; i < graph.nodes.length; i++) {
    for (const edge of graph.edges) {
      const next = (level.get(edge.from) ?? 0) + 1;
      if (next > (level.get(edge.to) ?? 0)) {
        level.set(edge.to, next);
      }
    }
  }

  const columns = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const lvl = level.get(node.name) ?? 0;
    const col = columns.get(lvl) ?? [];
    col.push(node.name);
    columns.set(lvl, col);
  }

  const maxRows = Math.max(...[...columns.values()].map((names) => names.length));
  const columnCount = Math.max(...columns.keys()) + 1;

  const positions = new Map<string, { x: number; y: number }>();
  for (const [lvl, names] of columns) {
    names.sort();
    const colHeight = names.length * GRAPH_NODE_HEIGHT + (names.length - 1) * ROW_GAP;
    const fullHeight = maxRows * GRAPH_NODE_HEIGHT + (maxRows - 1) * ROW_GAP;
    const offsetY = PADDING + (fullHeight - colHeight) / 2;
    names.forEach((name, i) => {
      positions.set(name, {
        x: PADDING + lvl * (GRAPH_NODE_WIDTH + COLUMN_GAP),
        y: offsetY + i * (GRAPH_NODE_HEIGHT + ROW_GAP),
      });
    });
  }

  const nodes: PositionedNode[] = graph.nodes.map((node) => {
    const pos = positions.get(node.name)!;
    return { ...node, level: level.get(node.name) ?? 0, x: pos.x, y: pos.y };
  });

  const width = PADDING * 2 + columnCount * GRAPH_NODE_WIDTH + (columnCount - 1) * COLUMN_GAP;
  const height = PADDING * 2 + maxRows * GRAPH_NODE_HEIGHT + (maxRows - 1) * ROW_GAP;

  return { nodes, edges: graph.edges, width, height };
}
