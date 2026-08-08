import type {
  Box,
  LayoutEdgeInput,
  LayoutedEdge,
  LayoutedNode,
} from "./layoutTypes";
import { EDGE_LABEL_FONT_SIZE } from "./layoutText";

/**
 * Arrow geometry for a solved graph.
 *
 * The solver places the boxes; this turns each edge into the points and label
 * position an Excalidraw arrow needs. Kept apart from the orchestration so the
 * routing rules have room to grow without pushing the module over the line
 * limit.
 */

// Distance kept between an arrow tip and the shape it points at. Baked into the
// points rather than left to the binding gap: Excalidraw re-projects a gapped
// endpoint after the arrowhead is placed, which renders as a kinked tip.
export const ARROW_CLEARANCE = 8;

// Sideways bow applied to parallel edges so two arrows between the same pair of
// nodes stay distinguishable.
const PARALLEL_EDGE_SPREAD = 34;

const SELF_LOOP_HEIGHT = 46;
const SELF_LOOP_WIDTH = 54;

/** Point where the line towards (tx,ty) leaves the box's border. */
export const edgePoint = (
  box: Box,
  tx: number,
  ty: number,
): { x: number; y: number } => {
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

/** Arrow points and label positions for every edge whose endpoints were solved. */
export const assembleEdges = (
  inputEdges: LayoutEdgeInput[],
  measured: Map<string, LayoutedNode>,
): LayoutedEdge[] => {
  // Count edges per node pair up front so parallel ones can be fanned apart.
  const pairTotals = new Map<string, number>();
  for (const edge of inputEdges) {
    if (!measured.has(edge.from) || !measured.has(edge.to)) continue;
    const key = pairKey(edge.from, edge.to);
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + 1);
  }
  const pairSeen = new Map<string, number>();

  const edges: LayoutedEdge[] = [];
  const selfLoopsSeen = new Map<string, number>();

  for (const edge of inputEdges) {
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
        let t =
          total === 2 ? (nth === 0 ? 0.3 : 0.7) : 0.25 + (0.5 * nth) / Math.max(1, total - 1);
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

  return edges;
};
