import type { Box } from "./layoutTypes";
import type { Point } from "./layoutSolver";

/**
 * Polyline arithmetic for the layout edges.
 *
 * Nothing here knows about graphs or Excalidraw: it trims, offsets, simplifies
 * and samples a list of points. Split out of layoutEdges.ts so the routing rules
 * there stay readable, and because that module is at the repo's line limit.
 */

// Distance kept between an arrow tip and the shape it points at. Baked into the
// points rather than left to the binding gap: Excalidraw re-projects a gapped
// endpoint after the arrowhead is placed, which renders as a kinked tip.
export const ARROW_CLEARANCE = 8;

// Beyond this multiple of the offset, a mitred corner spikes out far enough to
// look like a defect, so the corner is cut off instead.
const MITER_LIMIT = 3.5;

export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** Drop repeated points and points sitting on the line through their neighbours. */
export const simplify = (points: Point[]): Point[] => {
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
export const offsetPolyline = (points: Point[], delta: number): Point[] => {
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

export const inflatedContains = (box: Box, point: Point, pad: number): boolean =>
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

export const clipRoute = (points: Point[], from: Box, to: Box): Point[] => {
  const head = clipHead(points, from);
  const tail = clipHead([...head].reverse(), to).reverse();
  return tail.length >= 2 ? tail : points;
};

/** The point half way along the route, measured by arc length. */
export const midpointOf = (points: Point[]): Point => {
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
export const alongRoute = (points: Point[], fraction: number): { at: Point; normal: Point } => {
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

/**
 * Does the segment a→b touch the box, shrunk by `inset` on every side?
 *
 * Liang-Barsky clipping: exact, and a fixed amount of work per box. Sampling the
 * segment instead is simpler to read but costs enough to show up as event-loop
 * delay once a graph has a couple of hundred edges and boxes.
 */
export const segmentHitsBox = (a: Point, b: Point, box: Box, inset: number): boolean => {
  const minX = box.x + inset;
  const maxX = box.x + box.width - inset;
  const minY = box.y + inset;
  const maxY = box.y + box.height - inset;
  if (minX >= maxX || minY >= maxY) return false;
  // Cheap rejection before the clipping itself.
  if (Math.max(a.x, b.x) <= minX || Math.min(a.x, b.x) >= maxX) return false;
  if (Math.max(a.y, b.y) <= minY || Math.min(a.y, b.y) >= maxY) return false;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let enter = 0;
  let leave = 1;
  const edges: [number, number][] = [
    [-dx, a.x - minX],
    [dx, maxX - a.x],
    [-dy, a.y - minY],
    [dy, maxY - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false; // parallel to this slab and outside it
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > leave) return false;
      if (r > enter) enter = r;
    } else {
      if (r < enter) return false;
      if (r < leave) leave = r;
    }
  }
  return enter < leave;
};
