import dagre from "@dagrejs/dagre";
import type { LayoutEdgeInput, LayoutGraphInput, LayoutedNode } from "./layoutTypes";
import { CHAR_WIDTH_RATIO, EDGE_LABEL_FONT_SIZE } from "./layoutText";
import { PARALLEL_EDGE_SPREAD } from "./layoutEdges";

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

export type Point = { x: number; y: number };

export type SolverResult = {
  positions: Record<string, Point>;
  /** Routed polyline per edge name, already clipped to the node borders. */
  edgePoints: Record<string, Point[]>;
  /** Where the solver reserved room for a label, per edge name. */
  edgeLabels: Record<string, Point>;
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

/** A solved graph, in the caller's terms. */
export type SolvedGraph = {
  positions: Map<string, Point>;
  /** Route per input edge index. Parallel edges share the same one. */
  routeByEdgeIndex: Map<number, Point[]>;
  /** Reserved label position per input edge index, where the solver gave one. */
  labelByEdgeIndex: Map<number, Point>;
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

  // Two passes over the edges: the first sizes each ordered pair, the second
  // emits one solver edge per pair. Grouping has to be known up front, because
  // what dagre reserves for a pair depends on how many edges share its route.
  const pairOf = (edge: LayoutEdgeInput): string | null => {
    const from = idByKey.get(edge.from);
    const to = idByKey.get(edge.to);
    // Self-loops are withheld: dagre has no rank to route them between, and they
    // get their own geometry. Unknown endpoints are rejected before this point.
    if (!from || !to || from === to) return null;
    return `${from}->${to}`;
  };

  const groupSize = new Map<string, number>();
  const groupLabel = new Map<string, { width: number; height: number }>();
  for (const edge of input.edges) {
    const pair = pairOf(edge);
    if (!pair) continue;
    groupSize.set(pair, (groupSize.get(pair) ?? 0) + 1);
    if (!edge.label) continue;
    const box = labelBox(edge.label);
    const current = groupLabel.get(pair);
    groupLabel.set(pair, {
      width: Math.max(current?.width ?? 0, box.width),
      height: Math.max(current?.height ?? 0, box.height),
    });
  }

  // Ranks run vertically for TB/BT, so a fan spreads across the width; for LR/RL
  // it spreads across the height.
  const acrossWidth = (input.direction ?? "TB") === "TB" || input.direction === "BT";

  const edges: SolverJob["edges"] = [];
  const nameByEdgeIndex = new Map<number, string>();
  const nameByPair = new Map<string, string>();

  input.edges.forEach((edge, index) => {
    const pair = pairOf(edge);
    if (!pair) return;

    const already = nameByPair.get(pair);
    if (already !== undefined) {
      nameByEdgeIndex.set(index, already);
      return;
    }

    const name = `e${index}`;
    nameByPair.set(pair, name);
    nameByEdgeIndex.set(index, name);

    // Declaring a size makes dagre reserve room along the route. That covers the
    // group's widest label, plus the width the fan will occupy: the parallel
    // edges are spread around this one route afterwards, and without the extra
    // room the outermost lane would be free to cut through a neighbouring box.
    const label = groupLabel.get(pair);
    const fan = ((groupSize.get(pair) ?? 1) - 1) * PARALLEL_EDGE_SPREAD;
    const width = (label?.width ?? 0) + (acrossWidth ? fan : 0);
    const height = (label?.height ?? 0) + (acrossWidth ? 0 : fan);
    edges.push({
      from: idByKey.get(edge.from) as string,
      to: idByKey.get(edge.to) as string,
      name,
      label: width || height ? { width, height, labelpos: "c" } : undefined,
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
const usable = (point: Point | undefined): point is Point =>
  !!point && Number.isFinite(point.x) && Number.isFinite(point.y);

export const readSolved = (plan: SolverPlan, solved: SolverResult): SolvedGraph => {
  const positions = new Map<string, Point>();
  for (const [id, key] of plan.keyById) {
    const pos = solved.positions[id];
    if (!usable(pos)) {
      throw new LayoutSolveError(`No position for node "${key}"`);
    }
    positions.set(key, pos);
  }
  if (!Number.isFinite(solved.width) || !Number.isFinite(solved.height)) {
    throw new LayoutSolveError("Solver returned no graph size");
  }

  // A route that came back unusable is dropped rather than rejected: the edge
  // assembly falls back to a straight line between the two boxes, which is worse
  // looking but still a correct arrow.
  const routeByEdgeIndex = new Map<number, Point[]>();
  const labelByEdgeIndex = new Map<number, Point>();
  for (const [index, name] of plan.nameByEdgeIndex) {
    const route = solved.edgePoints[name];
    if (Array.isArray(route) && route.length >= 2 && route.every(usable)) {
      routeByEdgeIndex.set(index, route);
    }
    const label = solved.edgeLabels[name];
    if (usable(label)) labelByEdgeIndex.set(index, label);
  }
  return { positions, routeByEdgeIndex, labelByEdgeIndex };
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
  // dagre routes each edge around the boxes it would otherwise cross, and moves
  // boxes aside to leave room for that route. Reading the polyline back is the
  // whole point of declaring the sizes above: drawing a straight line instead
  // walks through the very gap the solver just made.
  const edgePoints: SolverResult["edgePoints"] = {};
  const edgeLabels: SolverResult["edgeLabels"] = {};
  for (const edge of job.edges) {
    const solved = graph.edge({ v: edge.from, w: edge.to, name: edge.name });
    if (!solved) continue;
    if (Array.isArray(solved.points)) {
      edgePoints[edge.name] = solved.points.map((p) => ({ x: p.x, y: p.y }));
    }
    if (typeof solved.x === "number" && typeof solved.y === "number") {
      edgeLabels[edge.name] = { x: solved.x, y: solved.y };
    }
  }
  const size = graph.graph();
  return {
    positions,
    edgePoints,
    edgeLabels,
    width: size.width ?? 0,
    height: size.height ?? 0,
  };
};
