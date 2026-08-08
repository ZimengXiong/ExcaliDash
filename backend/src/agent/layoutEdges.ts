import type {
  Box,
  LayoutEdgeInput,
  LayoutedEdge,
  LayoutedNode,
} from "./layoutTypes";
import type { Point, SolvedGraph } from "./layoutSolver";
import { EDGE_LABEL_FONT_SIZE } from "./layoutText";

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

// Distance kept between an arrow tip and the shape it points at. Baked into the
// points rather than left to the binding gap: Excalidraw re-projects a gapped
// endpoint after the arrowhead is placed, which renders as a kinked tip.
export const ARROW_CLEARANCE = 8;

// Sideways spacing between parallel edges sharing one solved route.
export const PARALLEL_EDGE_SPREAD = 34;

// Beyond this multiple of the offset, a mitred corner spikes out far enough to
// look like a defect, so the corner is cut off instead.
const MITER_LIMIT = 3.5;

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

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Drop repeated points and points sitting on the line through their neighbours. */
const simplify = (points: Point[]): Point[] => {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (!last || distance(last, point) > 0.01) out.push(point);
  }
  if (out.length < 3) return out;
  const kept: Point[] = [out[0]];
  for (let i = 1; i < out.length - 1; i += 1) {
    const a = kept[kept.length - 1];
    const b = out[i];
    const c = out[i + 1];
    // Twice the triangle area; zero means the three are collinear.
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
    if (area / (distance(a, c) || 1) > 0.05) kept.push(b);
  }
  kept.push(out[out.length - 1]);
  return kept;
};

/**
 * A parallel copy of the polyline, `delta` to its left.
 *
 * Offsetting each point along its own segment normal would pinch the spacing at
 * every bend, so corners use the intersection of the two offset segments (a
 * mitre) and fall back to cutting the corner when that intersection runs away.
 */
const offsetPolyline = (points: Point[], delta: number): Point[] => {
  if (delta === 0 || points.length < 2) return points;
  const normals: Point[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy) || 1;
    normals.push({ x: -dy / len, y: dx / len });
  }

  const out: Point[] = [
    { x: points[0].x + normals[0].x * delta, y: points[0].y + normals[0].y * delta },
  ];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = normals[i - 1];
    const b = normals[i];
    const bisector = { x: a.x + b.x, y: a.y + b.y };
    const len = Math.hypot(bisector.x, bisector.y);
    // 1/cos(theta/2) keeps the offset line parallel through the corner; when the
    // segments nearly double back that runs away, so the corner is cut instead.
    const scale = len < 1e-6 ? Infinity : 2 / len;
    if (scale > MITER_LIMIT) {
      out.push({ x: points[i].x + a.x * delta, y: points[i].y + a.y * delta });
      out.push({ x: points[i].x + b.x * delta, y: points[i].y + b.y * delta });
      continue;
    }
    out.push({
      x: points[i].x + (bisector.x / len) * delta * scale,
      y: points[i].y + (bisector.y / len) * delta * scale,
    });
  }
  const last = normals[normals.length - 1];
  const tail = points[points.length - 1];
  out.push({ x: tail.x + last.x * delta, y: tail.y + last.y * delta });
  return out;
};

const inflatedContains = (box: Box, point: Point, pad: number): boolean =>
  point.x >= box.x - pad &&
  point.x <= box.x + box.width + pad &&
  point.y >= box.y - pad &&
  point.y <= box.y + box.height + pad;

/** Where segment a→b leaves the padded box, to within a hundredth of a pixel. */
const exitPoint = (a: Point, b: Point, box: Box, pad: number): Point => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    const point = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid };
    if (inflatedContains(box, point, pad)) lo = mid;
    else hi = mid;
  }
  return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi };
};

/**
 * Trim the head of the route back to where it leaves the box, plus clearance.
 *
 * Offsetting a fanned edge moves its endpoints off the border the solver had
 * clipped them to, so clipping happens after the fan rather than before it.
 */
const clipHead = (points: Point[], box: Box): Point[] => {
  if (!inflatedContains(box, points[0], ARROW_CLEARANCE)) return points;
  let i = 0;
  while (i + 1 < points.length && inflatedContains(box, points[i + 1], ARROW_CLEARANCE)) {
    i += 1;
  }
  if (i + 1 >= points.length) return points; // wholly inside: nothing usable to trim
  return [exitPoint(points[i], points[i + 1], box, ARROW_CLEARANCE), ...points.slice(i + 1)];
};

const clipRoute = (points: Point[], from: Box, to: Box): Point[] => {
  const head = clipHead(points, from);
  const tail = clipHead([...head].reverse(), to).reverse();
  return tail.length >= 2 ? tail : points;
};

/** The point half way along the route, measured by arc length. */
const midpointOf = (points: Point[]): Point => {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i += 1) total += distance(points[i], points[i + 1]);
  let walked = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const step = distance(points[i], points[i + 1]);
    if (walked + step >= total / 2) {
      const t = step === 0 ? 0 : (total / 2 - walked) / step;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    walked += step;
  }
  return points[points.length - 1];
};

/** The point at `fraction` along the route, and the normal there. */
const alongRoute = (points: Point[], fraction: number): { at: Point; normal: Point } => {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i += 1) total += distance(points[i], points[i + 1]);
  const target = total * fraction;
  let walked = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const step = distance(points[i], points[i + 1]);
    if (walked + step >= target || i + 2 === points.length) {
      const t = step === 0 ? 0 : Math.min(1, (target - walked) / step);
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const len = Math.hypot(dx, dy) || 1;
      return {
        at: { x: points[i].x + dx * t, y: points[i].y + dy * t },
        normal: { x: -dy / len, y: dx / len },
      };
    }
    walked += step;
  }
  return { at: points[0], normal: { x: 0, y: 0 } };
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

/** A straight line between two boxes, for an edge the solver returned no route for. */
const straightRoute = (from: LayoutedNode, to: LayoutedNode): Point[] => {
  const fromCentre = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCentre = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  return [
    edgePoint(boxOf(from), toCentre.x, toCentre.y),
    edgePoint(boxOf(to), fromCentre.x, fromCentre.y),
  ];
};

/** Arrow points and label positions for every edge whose endpoints were solved. */
export const assembleEdges = (
  inputEdges: LayoutEdgeInput[],
  measured: Map<string, LayoutedNode>,
  solved: SolvedGraph,
  origin: Point,
): LayoutedEdge[] => {
  // Parallel edges share one solved route and are fanned around it. Grouping is
  // by ordered pair: dagre already routes A→B and B→A apart from each other.
  const groupSize = new Map<string, number>();
  for (const edge of inputEdges) {
    if (!measured.has(edge.from) || !measured.has(edge.to)) continue;
    if (edge.from === edge.to) continue;
    const key = `${edge.from}→${edge.to}`;
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

    const key = `${edge.from}→${edge.to}`;
    const total = groupSize.get(key) ?? 1;
    const nth = groupSeen.get(key) ?? 0;
    groupSeen.set(key, nth + 1);

    const solvedRoute = solved.routeByEdgeIndex.get(index);
    const centreRoute = solvedRoute ? solvedRoute.map(shift) : straightRoute(from, to);

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
      const reserved = solved.labelByEdgeIndex.get(index);
      // Excalidraw puts a bound label at the arrow's midpoint. Where that is the
      // spot the solver reserved anyway, binding is free: the label rides along
      // when the arrow is dragged, and Excalidraw breaks the line around it. Any
      // further apart and binding would drag the label out of its reserved slot
      // and back onto a box, so it is positioned explicitly instead.
      const midpoint = midpointOf(route);
      const target = reserved ? shift(reserved) : midpoint;
      if (total === 1 && distance(target, midpoint) <= 1.5) {
        layouted.label = {
          text: edge.label,
          x: Math.round(midpoint.x),
          y: Math.round(midpoint.y),
          fontSize: EDGE_LABEL_FONT_SIZE,
          bound: true,
        };
      } else {
        // Fanned edges would otherwise stack every label on the same reserved
        // point, so they are staggered along their own lane instead.
        const fraction = total === 1 ? 0.5 : 0.3 + (0.4 * nth) / Math.max(1, total - 1);
        const { at, normal } = alongRoute(route, fraction);
        const nudge = total === 1 ? 0 : 14 * (nth % 2 === 0 ? 1 : -1);
        layouted.label = {
          text: edge.label,
          x: Math.round((total === 1 ? target.x : at.x) + normal.x * nudge),
          y: Math.round((total === 1 ? target.y : at.y) + normal.y * nudge),
          fontSize: EDGE_LABEL_FONT_SIZE,
          bound: false,
        };
      }
    }

    edges.push(layouted);
  });

  return edges;
};
