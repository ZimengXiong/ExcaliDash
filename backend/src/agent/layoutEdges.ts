import type {
  Box,
  LayoutEdgeInput,
  LayoutedEdge,
  LayoutedNode,
} from "./layoutTypes";
import type { Point, SolvedGraph } from "./layoutSolver";
import { CHAR_WIDTH_RATIO, EDGE_LABEL_FONT_SIZE } from "./layoutText";
import {
  ARROW_CLEARANCE,
  alongRoute,
  clipRoute,
  distance,
  segmentHitsBox,
  midpointOf,
  offsetPolyline,
  simplify,
} from "./layoutGeometry";

export { ARROW_CLEARANCE } from "./layoutGeometry";

/**
 * Arrow geometry for a solved graph.
 *
 * The solver does the hard part: it routes each edge around the boxes it would
 * otherwise cross, and moves boxes aside to leave room for that route. This
 * takes the route it returned and turns it into the points and label position an
 * Excalidraw arrow needs. Drawing a straight line between the two boxes instead
 * walks through the very gap the solver just made, which is what the whole op is
 * supposed to avoid.
 */

// Sideways spacing between parallel edges sharing one solved route.
export const PARALLEL_EDGE_SPREAD = 34;

const SELF_LOOP_HEIGHT = 46;
const SELF_LOOP_WIDTH = 54;

/** Point where the line towards (tx,ty) leaves the box's border. */
export const edgePoint = (box: Box, tx: number, ty: number): Point => {
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

const boxOf = (node: LayoutedNode): Box => ({
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
});

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

/** A straight line between two boxes, border to border. */
const straightRoute = (from: LayoutedNode, to: LayoutedNode): Point[] => {
  const fromCentre = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCentre = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  return [
    edgePoint(boxOf(from), toCentre.x, toCentre.y),
    edgePoint(boxOf(to), fromCentre.x, fromCentre.y),
  ];
};

const overlapsBox = (box: Box, rect: Box): boolean =>
  rect.x < box.x + box.width &&
  box.x < rect.x + rect.width &&
  rect.y < box.y + box.height &&
  box.y < rect.y + rect.height;

/**
 * Would this straight edge, or the caption sitting on it, run into a box?
 *
 * Both are reasons to take the solver's route instead. The solver reserves room
 * along the route for a label; a straight line has no such reservation, so a wide
 * caption at its midpoint can land on a box the line itself misses.
 */
const directRouteIsClear = (
  route: Point[],
  edge: LayoutEdgeInput,
  measured: Map<string, LayoutedNode>,
): boolean => {
  const label = edge.label
    ? (() => {
        const at = midpointOf(route);
        const width = edge.label.length * EDGE_LABEL_FONT_SIZE * CHAR_WIDTH_RATIO + 12;
        const height = EDGE_LABEL_FONT_SIZE * 1.6;
        return { x: at.x - width / 2, y: at.y - height / 2, width, height };
      })()
    : null;

  for (const [key, node] of measured) {
    if (key === edge.from || key === edge.to) continue;
    const box = boxOf(node);
    if (label && overlapsBox(box, label)) return false;
    for (let i = 0; i + 1 < route.length; i += 1) {
      // A small inset, so an arrow grazing a corner is not called a hit.
      if (segmentHitsBox(route[i], route[i + 1], box, 2)) return false;
    }
  }
  return true;
};

/** Arrow points and label positions for every edge whose endpoints were solved. */
export const assembleEdges = (
  inputEdges: LayoutEdgeInput[],
  measured: Map<string, LayoutedNode>,
  solved: SolvedGraph,
  origin: Point,
): LayoutedEdge[] => {
  // Edges sharing a pair of boxes are fanned apart. Grouping is by unordered
  // pair, so A→B and B→A count as one group: they run along the same straight
  // line and would otherwise be drawn exactly on top of each other.
  const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
  const groupSize = new Map<string, number>();
  for (const edge of inputEdges) {
    if (!measured.has(edge.from) || !measured.has(edge.to)) continue;
    if (edge.from === edge.to) continue;
    const key = pairKey(edge.from, edge.to);
    groupSize.set(key, (groupSize.get(key) ?? 0) + 1);
  }
  const groupSeen = new Map<string, number>();
  const selfLoopsSeen = new Map<string, number>();
  const shift = (point: Point): Point => ({
    x: point.x + origin.x,
    y: point.y + origin.y,
  });

  const edges: LayoutedEdge[] = [];

  inputEdges.forEach((edge, index) => {
    const from = measured.get(edge.from);
    const to = measured.get(edge.to);
    if (!from || !to) return;

    // A self-loop has no direction to project onto, so it gets an explicit arc
    // above the node instead of a zero-length arrow between two identical points.
    if (edge.from === edge.to) {
      const nth = selfLoopsSeen.get(edge.from) ?? 0;
      selfLoopsSeen.set(edge.from, nth + 1);
      edges.push(selfLoopEdge(edge, from, nth));
      return;
    }

    const key = pairKey(edge.from, edge.to);
    const total = groupSize.get(key) ?? 1;
    const nth = groupSeen.get(key) ?? 0;
    groupSeen.set(key, nth + 1);

    // A straight arrow reads better than a routed one, and it is what an arrow
    // between two boxes looks like everywhere else in the editor. So the direct
    // line is the default, and the solver's route is used only where the direct
    // line would actually run through a box. On an ordinary diagram that means
    // nothing changes; on a chain with a shortcut past its middle, one edge
    // bends and the rest stay straight.
    const direct = straightRoute(from, to);
    const solvedRoute = solved.routeByEdgeIndex.get(index);
    const centreRoute =
      solvedRoute && !directRouteIsClear(direct, edge, measured)
        ? solvedRoute.map(shift)
        : direct;

    const lane = (nth - (total - 1) / 2) * PARALLEL_EDGE_SPREAD;
    const route = simplify(
      clipRoute(
        simplify(offsetPolyline(simplify(centreRoute), lane)),
        boxOf(from),
        boxOf(to),
      ),
    );

    const head = route[0];
    const layouted: LayoutedEdge = {
      from: edge.from,
      to: edge.to,
      x: Math.round(head.x),
      y: Math.round(head.y),
      points: route.map((point) => [
        Math.round(point.x - head.x),
        Math.round(point.y - head.y),
      ]),
    };

    if (edge.label) {
      // One edge between two boxes always gets a bound label. Excalidraw then
      // breaks the line around the text, which is both the nicest result and the
      // consistent one: a caption that is sometimes inside the line and
      // sometimes floating beside it reads as a bug. The solver has already
      // reserved room along the route for it.
      const midpoint = midpointOf(route);
      if (total === 1) {
        layouted.label = {
          text: edge.label,
          x: Math.round(midpoint.x),
          y: Math.round(midpoint.y),
          fontSize: EDGE_LABEL_FONT_SIZE,
          bound: true,
        };
      } else {
        // Parallel edges cannot all be bound: Excalidraw puts every bound label
        // at its arrow's midpoint, and for a fanned group those are nearly the
        // same point. They are staggered along their own lane instead.
        // Opposing edges run in opposite directions, so the same fraction along
        // each lands in the same place. Measure from a fixed end of the pair.
        let fraction = total === 2 ? (nth === 0 ? 0.3 : 0.7) : 0.3 + (0.4 * nth) / Math.max(1, total - 1);
        let side = nth % 2 === 0 ? 1 : -1;
        if (edge.from > edge.to) {
          fraction = 1 - fraction;
          side = -side;
        }
        const { at, normal } = alongRoute(route, fraction);
        const nudge = 16 * side;
        layouted.label = {
          text: edge.label,
          x: Math.round(at.x + normal.x * nudge),
          y: Math.round(at.y + normal.y * nudge),
          fontSize: EDGE_LABEL_FONT_SIZE,
          bound: false,
        };
      }
    }

    edges.push(layouted);
  });

  return edges;
};
