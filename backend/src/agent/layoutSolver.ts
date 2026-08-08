import dagre from "@dagrejs/dagre";
import type { LayoutGraphInput, LayoutedNode } from "./layoutTypes";
import { CHAR_WIDTH_RATIO, EDGE_LABEL_FONT_SIZE } from "./layoutText";

/**
 * The dagre adapter: everything that knows about the solver and nothing else.
 *
 * The job and result shapes are owned here rather than by the worker that runs
 * them, so the runner depends on the solver and not the other way round. Both
 * the inline pass below and the worker's inlined copy produce the same result
 * for the same job.
 */

export type SolverJob = {
  nodes: { key: string; width: number; height: number }[];
  edges: { from: string; to: string; name: string; label?: Record<string, unknown> }[];
  graphOptions: Record<string, unknown>;
};

export type SolverResult = {
  positions: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
};

const GRAPH_OPTIONS = {
  nodesep: 70, // within a rank
  ranksep: 110, // between ranks: room for edge labels and arrowheads
  edgesep: 30,
  marginx: 40,
  marginy: 40,
};

/** Node boxes and edge label sizes, i.e. everything the solver needs. */
export const buildSolverJob = (
  input: LayoutGraphInput,
  measured: Map<string, LayoutedNode>,
): SolverJob => {
  const nodes = [...measured.values()].map((node) => ({
    key: node.key,
    width: node.width,
    height: node.height,
  }));
  const edges: SolverJob["edges"] = [];
  // Declaring label size makes dagre reserve space for it, so labels stop
  // landing on top of the boxes they run between. Self-loops are withheld: dagre
  // has no rank to route them between, and they get their own geometry instead.
  input.edges.forEach((edge, index) => {
    if (!measured.has(edge.from) || !measured.has(edge.to)) return;
    if (edge.from === edge.to) return;
    edges.push({
      from: edge.from,
      to: edge.to,
      name: `e${index}`,
      label: edge.label
        ? {
            width: Math.round(
              edge.label.length * EDGE_LABEL_FONT_SIZE * CHAR_WIDTH_RATIO + 16,
            ),
            height: 24,
            labelpos: "c",
          }
        : undefined,
    });
  });
  return {
    nodes,
    edges,
    graphOptions: { ...GRAPH_OPTIONS, rankdir: input.direction ?? "TB" },
  };
};

/** The dagre pass itself. Identical to what the worker runs. */
export const solveSync = (job: SolverJob): SolverResult => {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph(job.graphOptions);
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of job.nodes) {
    graph.setNode(node.key, { width: node.width, height: node.height });
  }
  for (const edge of job.edges) {
    graph.setEdge(edge.from, edge.to, edge.label ?? {}, edge.name);
  }
  dagre.layout(graph);
  const positions: SolverResult["positions"] = {};
  for (const node of job.nodes) {
    const pos = graph.node(node.key);
    if (pos) positions[node.key] = { x: pos.x, y: pos.y };
  }
  const size = graph.graph();
  return { positions, width: size.width ?? 0, height: size.height ?? 0 };
};
