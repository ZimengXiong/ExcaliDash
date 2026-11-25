import { ARROW_CLEARANCE, simplify } from "./layoutGeometry";
import type { Point } from "./layoutSolver";

/**
 * Arrow geometry for the `connect` op: where an arrow between two existing
 * shapes starts and ends, and which way it runs.
 *
 * A connector drawn centre to centre runs through both boxes, and every arrow
 * into a shape lands on the same point. Excalidraw only re-projects a bound
 * endpoint when a shape is moved, so a freshly loaded scene shows exactly the
 * points stored here: they have to sit on the shape borders already.
 */

export type ConnectRouting = "straight" | "elbow";

export type Shape = {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Side = "left" | "right" | "top" | "bottom";

export type ConnectEnd = {
  point: Point;
  // Elbow arrows bind to a fixed spot on the shape, as a ratio of its bounds.
  fixedPoint?: [number, number];
};

export type ConnectRoute = {
  points: Point[];
  start: ConnectEnd;
  end: ConnectEnd;
  elbowed: boolean;
};

// Sideways spacing between arrows that join the same two shapes.
export const CONNECT_LANE_SPREAD = 24;

// Excalidraw nudges a fixed point of exactly 0.5 off centre, because an elbow
// arrow bound dead centre on a side flips between its two candidate routes.
const CENTRE_RATIO = 0.5001;

const centreOf = (s: Shape): Point => ({
  x: s.x + s.width / 2,
  y: s.y + s.height / 2,
});

/**
 * How far along `dir` from `p` (inside the shape) the shape's outline is.
 * Rectangles, ellipses and diamonds use their real outline; anything else is
 * treated as its bounding box.
 */
const distanceToOutline = (s: Shape, p: Point, dir: Point): number => {
  const c = centreOf(s);
  const hw = Math.max(s.width / 2, 0.5);
  const hh = Math.max(s.height / 2, 0.5);
  const px = p.x - c.x;
  const py = p.y - c.y;

  if (s.type === "ellipse") {
    // (px + t dx)^2 / hw^2 + (py + t dy)^2 / hh^2 = 1, largest root.
    const a = (dir.x * dir.x) / (hw * hw) + (dir.y * dir.y) / (hh * hh);
    const b = 2 * ((px * dir.x) / (hw * hw) + (py * dir.y) / (hh * hh));
    const cc = (px * px) / (hw * hw) + (py * py) / (hh * hh) - 1;
    const disc = b * b - 4 * a * cc;
    if (a === 0 || disc < 0) return 0;
    return Math.max(0, (-b + Math.sqrt(disc)) / (2 * a));
  }

  if (s.type === "diamond") {
    // |x|/hw + |y|/hh = 1. Along the ray the left side is piecewise linear and
    // convex, so the exit is the smallest positive root over the four quadrants.
    let best = Infinity;
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        const denom = (sx * dir.x) / hw + (sy * dir.y) / hh;
        if (denom <= 0) continue;
        const t = (1 - (sx * px) / hw - (sy * py) / hh) / denom;
        if (t >= 0 && t < best) best = t;
      }
    }
    return Number.isFinite(best) ? best : 0;
  }

  // Rectangle (and the bounding box of anything else): slab exit.
  let best = Infinity;
  if (dir.x > 0) best = Math.min(best, (hw - px) / dir.x);
  if (dir.x < 0) best = Math.min(best, (-hw - px) / dir.x);
  if (dir.y > 0) best = Math.min(best, (hh - py) / dir.y);
  if (dir.y < 0) best = Math.min(best, (-hh - py) / dir.y);
  return Number.isFinite(best) ? Math.max(0, best) : 0;
};

/** The n-th lane offset: 0, +1, -1, +2, -2, ... times the spread. */
export const laneOffset = (nth: number): number => {
  if (nth <= 0) return 0;
  const step = Math.ceil(nth / 2);
  return (nth % 2 === 1 ? 1 : -1) * step * CONNECT_LANE_SPREAD;
};

/**
 * A straight arrow from one shape's outline to the other's, plus clearance.
 * `lane` shifts the whole line sideways, so repeated connections between the
 * same two shapes stay apart instead of being drawn on top of each other.
 */
const straightRoute = (from: Shape, to: Shape, lane: number): ConnectRoute => {
  const a = centreOf(from);
  const b = centreOf(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / len, y: dy / len };
  const normal = { x: -dir.y, y: dir.x };

  // Keep the shifted line inside both shapes, or it would start outside them.
  const limit =
    0.4 *
    Math.min(
      Math.abs(normal.x) * from.width + Math.abs(normal.y) * from.height,
      Math.abs(normal.x) * to.width + Math.abs(normal.y) * to.height,
    );
  const shift = Math.max(-limit, Math.min(limit, lane));
  const a2 = { x: a.x + normal.x * shift, y: a.y + normal.y * shift };
  const b2 = { x: b.x + normal.x * shift, y: b.y + normal.y * shift };

  const back = { x: -dir.x, y: -dir.y };
  const tA = distanceToOutline(from, a2, dir) + ARROW_CLEARANCE;
  const tB = distanceToOutline(to, b2, back) + ARROW_CLEARANCE;

  // Overlapping or touching shapes: nothing sensible is left between them, so
  // fall back to the centre line rather than an arrow pointing backwards.
  if (tA + tB >= len) {
    return {
      points: [a2, b2],
      start: { point: a2 },
      end: { point: b2 },
      elbowed: false,
    };
  }
  const start = { x: a2.x + dir.x * tA, y: a2.y + dir.y * tA };
  const end = { x: b2.x + back.x * tB, y: b2.y + back.y * tB };
  return {
    points: [start, end],
    start: { point: start },
    end: { point: end },
    elbowed: false,
  };
};

const sidePoint = (
  s: Shape,
  side: Side,
  lane: number,
): { point: Point; fixedPoint: [number, number] } => {
  const horizontalSide = side === "left" || side === "right";
  // Slide along the side for a lane, staying well inside the corners.
  const span = horizontalSide ? s.height : s.width;
  const slide = Math.max(-span * 0.35, Math.min(span * 0.35, lane));
  const along = 0.5 + slide / (span || 1);
  const ratio: [number, number] =
    side === "left"
      ? [0, along]
      : side === "right"
        ? [1, along]
        : side === "top"
          ? [along, 0]
          : [along, 1];
  const fixed: [number, number] = [
    ratio[0] === 0.5 ? CENTRE_RATIO : ratio[0],
    ratio[1] === 0.5 ? CENTRE_RATIO : ratio[1],
  ];
  const onBorder = {
    x: s.x + ratio[0] * s.width,
    y: s.y + ratio[1] * s.height,
  };
  const out =
    side === "left"
      ? { x: -1, y: 0 }
      : side === "right"
        ? { x: 1, y: 0 }
        : side === "top"
          ? { x: 0, y: -1 }
          : { x: 0, y: 1 };
  // Ellipses and diamonds do not reach their bounding box away from the side
  // midpoints, so pull the endpoint in to their real outline.
  const inside = {
    x: onBorder.x - out.x * (s.width / 2),
    y: onBorder.y - out.y * (s.height / 2),
  };
  const reach = distanceToOutline(s, inside, out);
  const edge = { x: inside.x + out.x * reach, y: inside.y + out.y * reach };
  return {
    point: {
      x: edge.x + out.x * ARROW_CLEARANCE,
      y: edge.y + out.y * ARROW_CLEARANCE,
    },
    fixedPoint: fixed,
  };
};

/**
 * An orthogonal route: out of the side facing the target, a single dog-leg
 * half way across the gap, and into the facing side of the target.
 */
const elbowRoute = (
  from: Shape,
  to: Shape,
  lane: number,
): ConnectRoute | null => {
  const gapX = Math.max(to.x - (from.x + from.width), from.x - (to.x + to.width));
  const gapY = Math.max(
    to.y - (from.y + from.height),
    from.y - (to.y + to.height),
  );
  // Shapes that overlap on both axes have no side facing the other.
  if (gapX <= 2 * ARROW_CLEARANCE && gapY <= 2 * ARROW_CLEARANCE) return null;

  const a = centreOf(from);
  const b = centreOf(to);
  // Run along the axis with the clearer gap; prefer horizontal on a tie.
  const horizontal = gapX >= gapY;
  const [fromSide, toSide]: [Side, Side] = horizontal
    ? b.x >= a.x
      ? ["right", "left"]
      : ["left", "right"]
    : b.y >= a.y
      ? ["bottom", "top"]
      : ["top", "bottom"];

  const s = sidePoint(from, fromSide, lane);
  const e = sidePoint(to, toSide, lane);
  const points = horizontal
    ? (() => {
        const midX = (s.point.x + e.point.x) / 2;
        return [
          s.point,
          { x: midX, y: s.point.y },
          { x: midX, y: e.point.y },
          e.point,
        ];
      })()
    : (() => {
        const midY = (s.point.y + e.point.y) / 2;
        return [
          s.point,
          { x: s.point.x, y: midY },
          { x: e.point.x, y: midY },
          e.point,
        ];
      })();

  return {
    points: simplify(points),
    start: s,
    end: e,
    elbowed: true,
  };
};

export const connectRoute = (
  from: Shape,
  to: Shape,
  routing: ConnectRouting,
  lane = 0,
): ConnectRoute =>
  (routing === "elbow" ? elbowRoute(from, to, lane) : null) ??
  straightRoute(from, to, lane);

/**
 * Where Excalidraw draws a label bound to an arrow: the middle point when the
 * arrow has an odd number of points, otherwise the middle of the middle segment.
 * A label stored anywhere else jumps the first time the arrow is touched.
 */
export const arrowLabelAnchor = (points: Point[]): Point => {
  const n = points.length;
  if (n % 2 === 1) return points[(n - 1) / 2];
  const a = points[n / 2 - 1];
  const b = points[n / 2];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

/** A self-connection: an arc over the top edge of the shape. */
export const selfLoopRoute = (s: Shape, nth: number): Point[] => {
  const width = Math.min(54, Math.max(24, s.width * 0.5));
  const rise = 46 + nth * 22;
  const cx = s.x + s.width / 2;
  const y = s.y - ARROW_CLEARANCE;
  return [
    { x: cx - width / 2, y },
    { x: cx - width / 4, y: y - rise },
    { x: cx + width / 4, y: y - rise },
    { x: cx + width / 2, y },
  ];
};
