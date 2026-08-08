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
 *
 * Two things are deliberately not passed through verbatim:
 *
 *   Node keys are replaced with generated ids. graphlib stores nodes in a plain
 *   object, so a caller key of `__proto__` or `constructor` walks into
 *   Object.prototype and comes back as NaN coordinates. Mapping to `n0`, `n1`,
 *   ... lets callers use any key they like, including arbitrary Unicode.
 *
 *   Parallel edges between the same ordered pair are collapsed to one. Three or
 *   more of them make dagre throw ("Not possible to find intersection inside of
 *   the rectangle"), and they carry no extra structure for it: the originals are
 *   fanned out along the solved route afterwards. Opposing edges are left alone,
 *   since dagre already separates those itself.
 */

/** A solve that produced no usable geometry. Callers turn this into a 4xx. */
export class LayoutSolveError extends Error {}

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

/** A job plus what is needed to read its result back in the caller's terms. */
export type SolverPlan = {
  job: SolverJob;
  /** Caller's node key, by the internal id sent to the solver. */
  keyById: Map<string, string>;
  /** Solver edge name per input edge index; parallel edges share one. */
  nameByEdgeIndex: Map<number, string>;
};

const GRAPH_OPTIONS = {
  nodesep: 70, // within a rank
  ranksep: 110, // between ranks: room for edge labels and arrowheads
  edgesep: 30,
  marginx: 40,
  marginy: 40,
};

const labelBox = (label: string): { width: number; height: number } => ({
  width: Math.round(label.length * EDGE_LABEL_FONT_SIZE * CHAR_WIDTH_RATIO + 16),
  height: 24,
});

/** Node boxes and edge label sizes, i.e. everything the solver needs. */
export const buildSolverPlan = (
  input: LayoutGraphInput,
  measured: Map<string, LayoutedNode>,
): SolverPlan => {
  const idByKey = new Map<string, string>();
  const keyById = new Map<string, string>();
  const nodes: SolverJob["nodes"] = [];
  for (const node of measured.values()) {
    const id = `n${nodes.length}`;
    idByKey.set(node.key, id);
    keyById.set(id, node.key);
    nodes.push({ key: id, width: node.width, height: node.height });
  }

  // One solver edge per ordered pair. The first input edge of a group names it;
  // the group's largest label decides how much room dagre reserves, so a wide
  // label on any of the parallel edges still gets space.
  const edges: SolverJob["edges"] = [];
  const nameByEdgeIndex = new Map<number, string>();
  const indexByPair = new Map<string, number>();

  input.edges.forEach((edge, index) => {
    const from = idByKey.get(edge.from);
    const to = idByKey.get(edge.to);
    // Self-loops are withheld: dagre has no rank to route them between, and they
    // get their own geometry. Unknown endpoints are rejected before this point.
    if (!from || !to || from === to) return;

    const pair = `${from}->${to}`;
    const existing = indexByPair.get(pair);
    if (existing !== undefined) {
      nameByEdgeIndex.set(index, edges[existing].name);
      if (edge.label) {
        const box = labelBox(edge.label);
        const current = edges[existing].label as
          | { width: number; height: number; labelpos: string }
          | undefined;
        edges[existing].label = {
          width: Math.max(current?.width ?? 0, box.width),
          height: Math.max(current?.height ?? 0, box.height),
          labelpos: "c",
        };
      }
      return;
    }

    const name = `e${index}`;
    indexByPair.set(pair, edges.length);
    nameByEdgeIndex.set(index, name);
    // Declaring label size makes dagre reserve space for it, so labels stop
    // landing on top of the boxes they run between.
    edges.push({
      from,
      to,
      name,
      label: edge.label ? { ...labelBox(edge.label), labelpos: "c" } : undefined,
    });
  });

  return {
    job: {
      nodes,
      edges,
      graphOptions: { ...GRAPH_OPTIONS, rankdir: input.direction ?? "TB" },
    },
    keyById,
    nameByEdgeIndex,
  };
};

/**
 * Read a solved job back in the caller's terms, rejecting anything that is not a
 * usable number. A non-finite coordinate would otherwise reach the drawing and
 * be caught much later by the scene sanitizer as an opaque failure.
 */
export const readSolved = (
  plan: SolverPlan,
  solved: SolverResult,
): Map<string, { x: number; y: number }> => {
  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, key] of plan.keyById) {
    const pos = solved.positions[id];
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      throw new LayoutSolveError(`No position for node "${key}"`);
    }
    positions.set(key, pos);
  }
  if (!Number.isFinite(solved.width) || !Number.isFinite(solved.height)) {
    throw new LayoutSolveError("Solver returned no graph size");
  }
  return positions;
};

/**
 * dagre caches the previous call's graph at module scope (`_oldGraph` and
 * `_rawOldNodes` in its lib/layout.ts) to seed an incremental ordering pass, so
 * `layout()` is not a pure function of its input. Nodes from an unrelated
 * earlier graph then reach initOrder with no rank in the current one and it
 * throws on `layers[node.rank].push`. Measured over 400 seeded graphs: 24 fail
 * in sequence, none of them in isolation. Turning the cache off fixes all of
 * them, is marginally faster, and makes a solve depend only on its own input —
 * which matters here, because the worker is long-lived.
 */
const LAYOUT_OPTIONS = { useDynamic: false } as const;

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
  dagre.layout(graph, LAYOUT_OPTIONS);
  const positions: SolverResult["positions"] = {};
  for (const node of job.nodes) {
    const pos = graph.node(node.key);
    if (pos) positions[node.key] = { x: pos.x, y: pos.y };
  }
  const size = graph.graph();
  return { positions, width: size.width ?? 0, height: size.height ?? 0 };
};
