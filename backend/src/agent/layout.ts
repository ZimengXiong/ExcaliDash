import dagre from "@dagrejs/dagre";
import type { ShapeKind } from "./opSchemas";
import {
  CHAR_WIDTH_RATIO,
  DEFAULT_NODE_FONT_SIZE,
  EDGE_LABEL_FONT_SIZE,
  measureNode,
} from "./layoutText";

/**
 * Geometry for the `layout` op.
 *
 * `add_shape` takes x/y, which means whoever calls it has to decide where every
 * box goes. Models are poor at that: arrows end up crossing unrelated boxes and
 * edge labels land underneath them. This module takes the structure instead —
 * nodes and edges — and derives the geometry with dagre, the same split
 * mermaid-to-excalidraw uses with ELK.
 *
 * It is deliberately pure: it returns coordinates, and applyOps builds the
 * elements from them through the normal element factory.
 */

// Distance kept between an arrow tip and the shape it points at. Baked into the
// points rather than left to the binding gap: Excalidraw re-projects a gapped
// endpoint after the arrowhead is placed, which renders as a kinked tip.
const ARROW_CLEARANCE = 8;

// Sideways bow applied to parallel edges so two arrows between the same pair of
// nodes stay distinguishable.
const PARALLEL_EDGE_SPREAD = 34;

export type LayoutDirection = "TB" | "BT" | "LR" | "RL";

export type LayoutNodeInput = {
  key: string;
  label?: string;
  shape?: ShapeKind;
  fontSize?: number;
};

export type LayoutEdgeInput = {
  from: string;
  to: string;
  label?: string;
};

export type LayoutGraphInput = {
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  direction?: LayoutDirection;
  originX?: number;
  originY?: number;
};

export type LayoutedNode = {
  key: string;
  shape: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Label text after wrapping; absent when the node has no label. */
  text?: string;
  fontSize: number;
};

export type LayoutedEdgeLabel = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  /**
   * Bound labels are placed by Excalidraw at the arrow's midpoint, which is
   * exactly where parallel edges collide. Those are emitted unbound with an
   * explicit position instead.
   */
  bound: boolean;
};

export type LayoutedEdge = {
  from: string;
  to: string;
  x: number;
  y: number;
  points: [number, number][];
  label?: LayoutedEdgeLabel;
};

export type LayoutResult = {
  nodes: LayoutedNode[];
  edges: LayoutedEdge[];
  width: number;
  height: number;
};

type Box = { x: number; y: number; width: number; height: number };

/** Point where the line towards (tx,ty) leaves the box's border. */
const edgePoint = (box: Box, tx: number, ty: number): { x: number; y: number } => {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = box.width / 2;
  const hh = box.height / 2;
  if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
    const sign = dx > 0 ? 1 : -1;
    return { x: cx + sign * hw, y: cy + dy * (hw / Math.abs(dx)) };
  }
  const sign = dy > 0 ? 1 : -1;
  return { x: cx + dx * (hh / Math.abs(dy)), y: cy + sign * hh };
};

// Unordered pair identity. JSON keeps it collision-free for any node key,
// including ones containing separators.
const pairKey = (a: string, b: string): string => JSON.stringify([a, b].sort());

const SELF_LOOP_HEIGHT = 46;
const SELF_LOOP_WIDTH = 54;

/**
 * An arc leaving the top edge of a node and returning to it. Successive loops on
 * the same node are stacked so they stay individually visible.
 */
const selfLoopEdge = (
  edge: LayoutEdgeInput,
  node: LayoutedNode,
  nth: number,
): LayoutedEdge => {
  const rise = SELF_LOOP_HEIGHT + nth * 22;
  const startX = node.x + node.width / 2 - SELF_LOOP_WIDTH / 2;
  const endX = node.x + node.width / 2 + SELF_LOOP_WIDTH / 2;
  const y = node.y - ARROW_CLEARANCE;

  const layouted: LayoutedEdge = {
    from: edge.from,
    to: edge.to,
    x: Math.round(startX),
    y: Math.round(y),
    points: [
      [0, 0],
      [Math.round(SELF_LOOP_WIDTH / 4), -Math.round(rise)],
      [Math.round((SELF_LOOP_WIDTH * 3) / 4), -Math.round(rise)],
      [Math.round(endX - startX), 0],
    ],
  };

  if (edge.label) {
    layouted.label = {
      text: edge.label,
      x: Math.round(node.x + node.width / 2),
      y: Math.round(y - rise - 12),
      fontSize: EDGE_LABEL_FONT_SIZE,
      bound: false,
    };
  }
  return layouted;
};

type SolverJob = {
  nodes: { key: string; width: number; height: number }[];
  edges: { from: string; to: string; name: string; label?: Record<string, unknown> }[];
  graphOptions: Record<string, unknown>;
};

type SolverResult = {
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
const buildSolverJob = (
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
  // has no rank to route them between, and they get their own geometry below.
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

const measureNodes = (input: LayoutGraphInput): Map<string, LayoutedNode> => {
  const measured = new Map<string, LayoutedNode>();
  for (const node of input.nodes) {
    const fontSize = node.fontSize ?? DEFAULT_NODE_FONT_SIZE;
    const box = measureNode(node.label, fontSize);
    measured.set(node.key, {
      key: node.key,
      shape: node.shape ?? "rectangle",
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
      text: box.text,
      fontSize,
    });
  }
  return measured;
};

/**
 * Run the layout and return coordinates for every node and edge.
 *
 * Unknown edge endpoints are not silently dropped — the caller validates them
 * first and reports them per op.
 */
export const layoutGraphSync = (input: LayoutGraphInput): LayoutResult => {
  const measured = measureNodes(input);
  return assemble(input, measured, solveSync(buildSolverJob(input, measured)));
};

/** Turn solved node centres into the element geometry the applier needs. */
const assemble = (
  input: LayoutGraphInput,
  measured: Map<string, LayoutedNode>,
  solved: SolverResult,
): LayoutResult => {
  const originX = input.originX ?? 0;
  const originY = input.originY ?? 0;

  // dagre positions nodes by centre; Excalidraw wants the top-left corner.
  for (const node of measured.values()) {
    const position = solved.positions[node.key];
    if (!position) continue;
    node.x = Math.round(originX + position.x - node.width / 2);
    node.y = Math.round(originY + position.y - node.height / 2);
  }

  // Count edges per node pair up front so parallel ones can be fanned apart.
  const pairTotals = new Map<string, number>();
  for (const edge of input.edges) {
    if (!measured.has(edge.from) || !measured.has(edge.to)) continue;
    const key = pairKey(edge.from, edge.to);
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + 1);
  }
  const pairSeen = new Map<string, number>();

  const edges: LayoutedEdge[] = [];
  const selfLoopsSeen = new Map<string, number>();

  for (const edge of input.edges) {
    const from = measured.get(edge.from);
    const to = measured.get(edge.to);
    if (!from || !to) continue;

    // A self-loop has no direction to project onto, so it gets an explicit arc
    // above the node instead of a zero-length arrow between two identical points.
    if (edge.from === edge.to) {
      const nth = selfLoopsSeen.get(edge.from) ?? 0;
      selfLoopsSeen.set(edge.from, nth + 1);
      edges.push(selfLoopEdge(edge, from, nth));
      continue;
    }

    const fromCentre = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const toCentre = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    let start = edgePoint(from, toCentre.x, toCentre.y);
    let end = edgePoint(to, fromCentre.x, fromCentre.y);

    const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const ux = (end.x - start.x) / length;
    const uy = (end.y - start.y) / length;
    start = { x: start.x + ux * ARROW_CLEARANCE, y: start.y + uy * ARROW_CLEARANCE };
    end = { x: end.x - ux * ARROW_CLEARANCE, y: end.y - uy * ARROW_CLEARANCE };

    const key = pairKey(edge.from, edge.to);
    const total = pairTotals.get(key) ?? 1;
    const nth = pairSeen.get(key) ?? 0;
    pairSeen.set(key, nth + 1);

    const points: [number, number][] = [[0, 0]];
    if (total > 1) {
      const offset = (nth - (total - 1) / 2) * PARALLEL_EDGE_SPREAD;
      points.push([
        (end.x - start.x) / 2 - uy * offset,
        (end.y - start.y) / 2 + ux * offset,
      ]);
    }
    points.push([end.x - start.x, end.y - start.y]);

    const layouted: LayoutedEdge = {
      from: edge.from,
      to: edge.to,
      x: Math.round(start.x),
      y: Math.round(start.y),
      points: points.map(([px, py]) => [Math.round(px), Math.round(py)]),
    };

    if (edge.label) {
      if (total === 1) {
        // A bound label is nicest: Excalidraw breaks the line around the text.
        layouted.label = {
          text: edge.label,
          x: Math.round(start.x + (end.x - start.x) / 2),
          y: Math.round(start.y + (end.y - start.y) / 2),
          fontSize: EDGE_LABEL_FONT_SIZE,
          bound: true,
        };
      } else {
        // Bound labels always sit at the arrow's midpoint, so parallel edges
        // would stack their labels however far apart the arrows bow. Opposing
        // edges also run in opposite directions, so the same fraction along each
        // lands in the same spot — measure from a fixed end of the pair instead.
        let t = total === 2 ? (nth === 0 ? 0.3 : 0.7) : 0.25 + (0.5 * nth) / Math.max(1, total - 1);
        let side = nth % 2 === 0 ? 1 : -1;
        if (edge.from > edge.to) {
          t = 1 - t;
          side = -side;
        }
        const off = 18 * side;
        layouted.label = {
          text: edge.label,
          x: Math.round(start.x + (end.x - start.x) * t - uy * off),
          y: Math.round(start.y + (end.y - start.y) * t + ux * off),
          fontSize: EDGE_LABEL_FONT_SIZE,
          bound: false,
        };
      }
    }

    edges.push(layouted);
  }

  return {
    nodes: [...measured.values()],
    edges,
    width: Math.round(solved.width),
    height: Math.round(solved.height),
  };
};
