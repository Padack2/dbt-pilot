import { readFileSync, readdirSync } from "fs";
import path from "path";

// dbt manifest.json은 `dbt run`을 거쳐야만 생성/갱신되고, 그걸 웹 서버가 읽으려면
// 아티팩트를 어딘가에 영속화해서 동기화해야 한다. 대신 모델 SQL의 ref()/source() 호출을
// 요청마다 직접 파싱한다 — dbt를 전혀 거치지 않고 항상 실제 모델 파일과 100% 일치하며
// 별도 동기화/영속화가 필요 없다. (배포 시 이 디렉터리가 함께 번들되도록
// next.config.mjs의 outputFileTracingIncludes에 등록해둠)
const MODELS_DIR = path.join(process.cwd(), "..", "..", "pipeline", "dbt", "models");

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

const REF_RE = /ref\(\s*'([^']+)'\s*\)/g;
const SOURCE_RE = /source\(\s*'[^']+'\s*,\s*'([^']+)'\s*\)/g;
const MATERIALIZED_RE = /materialized\s*=\s*'([a-z_]+)'/;

function defaultMaterialization(folder: string): ModelNodeType {
  return folder === "staging" ? "view" : "incremental";
}

function readSqlFiles(folder: string): { name: string; folder: string; sql: string }[] {
  const dir = path.join(MODELS_DIR, folder);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({
      name: f.replace(/\.sql$/, ""),
      folder,
      sql: readFileSync(path.join(dir, f), "utf-8"),
    }));
}

export function getModelGraph(): ModelGraph {
  const files = [...readSqlFiles("staging"), ...readSqlFiles("marts")];

  const nodes = new Map<string, ModelNode>();
  const edges: ModelEdge[] = [];

  for (const file of files) {
    const configuredMaterialized = file.sql.match(MATERIALIZED_RE)?.[1];
    // marts 폴더 기본값은 dbt_project.yml상 'table'이지만, 이 그래프에서는
    // "MV냐 아니냐"가 중요하므로 table/incremental은 구분 없이 'incremental'로 표시한다.
    const type: ModelNodeType =
      configuredMaterialized === "materialized_view"
        ? "materialized_view"
        : configuredMaterialized === "view"
          ? "view"
          : configuredMaterialized === "table" || configuredMaterialized === "incremental"
            ? "incremental"
            : defaultMaterialization(file.folder);

    nodes.set(file.name, { name: file.name, type });

    for (const match of file.sql.matchAll(REF_RE)) {
      edges.push({ from: match[1], to: file.name });
    }
    for (const match of file.sql.matchAll(SOURCE_RE)) {
      const sourceName = match[1];
      if (!nodes.has(sourceName)) {
        nodes.set(sourceName, { name: sourceName, type: "source" });
      }
      edges.push({ from: sourceName, to: file.name });
    }
  }

  return { nodes: [...nodes.values()], edges };
}

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
