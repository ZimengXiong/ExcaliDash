import { describe, expect, it } from "vitest";
import { layoutGraphSync } from "./layout";
import { PARALLEL_EDGE_SPREAD } from "./layoutEdges";
import type { Point } from "./layoutSolver";
import { EDGE_LABEL_FONT_SIZE } from "./layoutText";
import { CHAR_WIDTH_RATIO } from "./layoutText";
import type { LayoutGraphInput, LayoutResult } from "./layoutTypes";

type Rect = { x0: number; y0: number; x1: number; y1: number };

const boxesOf = (result: LayoutResult): Map<string, Rect> =>
  new Map(
    result.nodes.map((node) => [
      node.key,
      { x0: node.x, y0: node.y, x1: node.x + node.width, y1: node.y + node.height },
    ]),
  );

/** Sample the segment densely rather than solving an intersection. */
const segmentEntersBox = (
  a: readonly [number, number],
  b: readonly [number, number],
  box: Rect,
  inset = 2,
): boolean => {
  const steps = Math.max(50, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    if (x > box.x0 + inset && x < box.x1 - inset && y > box.y0 + inset && y < box.y1 - inset) {
      return true;
    }
  }
  return false;
};

/** Every node an arrow passes through without being one of its endpoints. */
const arrowsThroughUnrelatedNodes = (result: LayoutResult): string[] => {
  const boxes = boxesOf(result);
  const hits: string[] = [];
  for (const edge of result.edges) {
    const points = edge.points.map(([px, py]) => [edge.x + px, edge.y + py] as const);
    for (let i = 0; i + 1 < points.length; i += 1) {
      for (const [key, box] of boxes) {
        if (key === edge.from || key === edge.to) continue;
        if (segmentEntersBox(points[i], points[i + 1], box)) {
          hits.push(`${edge.from}->${edge.to} through ${key}`);
        }
      }
    }
  }
  return hits;
};

/** Labels sit centred on their point; approximate the box the text will occupy. */
const labelsOverNodes = (result: LayoutResult): string[] => {
  const boxes = boxesOf(result);
  const hits: string[] = [];
  for (const edge of result.edges) {
    if (!edge.label) continue;
    const width = edge.label.text.length * EDGE_LABEL_FONT_SIZE * CHAR_WIDTH_RATIO;
    const height = EDGE_LABEL_FONT_SIZE * 1.25;
    const label: Rect = {
      x0: edge.label.x - width / 2,
      y0: edge.label.y - height / 2,
      x1: edge.label.x + width / 2,
      y1: edge.label.y + height / 2,
    };
    for (const [key, box] of boxes) {
      if (key === edge.from || key === edge.to) continue;
      if (label.x0 < box.x1 && box.x0 < label.x1 && label.y0 < box.y1 && box.y0 < label.y1) {
        hits.push(`${edge.from}->${edge.to} label over ${key}`);
      }
    }
  }
  return hits;
};

const graph = (
  keys: string[],
  edges: [string, string, string?][],
  direction: LayoutGraphInput["direction"] = "TB",
): LayoutGraphInput => ({
  nodes: keys.map((key) => ({ key, label: key })),
  edges: edges.map(([from, to, label]) => ({ from, to, label })),
  direction,
});

describe("edge routing", () => {
  // The one case that has to work: a chain with a shortcut past its middle. A
  // straight line from a to c runs through b, which is why the solver moves b
  // aside and routes around it.
  it("routes a -> c around b in an a -> b -> c chain", () => {
    const result = layoutGraphSync(
      graph(
        ["a", "b", "c"],
        [
          ["a", "c"],
          ["b", "c"],
          ["a", "b"],
        ],
      ),
    );
    expect(arrowsThroughUnrelatedNodes(result)).toEqual([]);

    // And specifically: the shortcut must bend rather than run straight down.
    const shortcut = result.edges.find((e) => e.from === "a" && e.to === "c");
    expect(shortcut?.points.length).toBeGreaterThan(2);
  });

  it("keeps edge labels off unrelated boxes", () => {
    const result = layoutGraphSync(
      graph(
        ["n0", "n1", "n2"],
        [
          ["n1", "n2", "long0"],
          ["n0", "n2", "long1"],
          ["n0", "n1", "very-long-edge-label-2"],
          ["n2", "n1", "long3"],
          ["n2", "n0", "long4"],
        ],
      ),
    );
    expect(labelsOverNodes(result)).toEqual([]);
  });

  it("keeps arrows off unrelated boxes across a corpus of layered graphs", () => {
    let seed = 99;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let checked = 0;
    let withHits = 0;
    for (let g = 0; g < 120; g += 1) {
      const size = 4 + Math.floor(rnd() * 5);
      const keys = Array.from({ length: size }, (_, i) => `n${i}`);
      const edges: [string, string, string?][] = [];
      for (let i = 0; i < size; i += 1) {
        for (let j = i + 1; j < size; j += 1) {
          if (rnd() < 0.35) edges.push([`n${i}`, `n${j}`]);
        }
      }
      if (edges.length === 0) continue;
      checked += 1;
      if (arrowsThroughUnrelatedNodes(layoutGraphSync(graph(keys, edges))).length > 0) {
        withHits += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
    // Drawing straight lines between the boxes puts this near half the corpus.
    // What is left is dagre's own routing grazing a box corner by a pixel or two.
    expect(withHits).toBeLessThanOrEqual(2);
  });

  // Offsetting each point along its own segment normal pinches the fan at every
  // bend, and dagre does produce corners sharp enough for that to show: turns of
  // up to about 155 degrees appear in ordinary cyclic graphs.
  it("holds the spacing of parallel lanes through bends", () => {
    const distanceToSegment = (p: Point, a: Point, b: Point): number => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
      return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    };
    const closest = (a: Point[], b: Point[]): number => {
      let min = Infinity;
      for (const [one, other] of [
        [a, b],
        [b, a],
      ] as const) {
        for (const point of one) {
          for (let i = 0; i + 1 < other.length; i += 1) {
            min = Math.min(min, distanceToSegment(point, other[i], other[i + 1]));
          }
        }
      }
      return min;
    };

    let seed = 1234;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let bent = 0;
    let tightest = Infinity;
    for (let g = 0; g < 120; g += 1) {
      const size = 3 + Math.floor(rnd() * 5);
      const keys = Array.from({ length: size }, (_, i) => `n${i}`);
      const edges: [string, string, string?][] = [];
      const count = size + Math.floor(rnd() * size * 2);
      for (let i = 0; i < count; i += 1) {
        edges.push([`n${Math.floor(rnd() * size)}`, `n${Math.floor(rnd() * size)}`]);
      }
      const first = "n0";
      const last = `n${size - 1}`;
      edges.push([first, last], [first, last], [first, last]);

      let result: LayoutResult;
      try {
        result = layoutGraphSync(graph(keys, edges, g % 2 ? "LR" : "TB"));
      } catch {
        continue;
      }
      const lanes = result.edges
        .filter((e) => e.from === first && e.to === last)
        .map((e) => e.points.map(([px, py]) => ({ x: e.x + px, y: e.y + py })));
      if (lanes.length < 3 || !lanes.some((lane) => lane.length > 2)) continue;
      bent += 1;
      tightest = Math.min(tightest, closest(lanes[0], lanes[1]), closest(lanes[1], lanes[2]));
    }

    expect(bent).toBeGreaterThan(20);
    // The lanes are laid out PARALLEL_EDGE_SPREAD apart. A naive offset lets that
    // collapse to roughly two thirds at the corners; a mitre keeps nearly all.
    expect(tightest).toBeGreaterThan(PARALLEL_EDGE_SPREAD * 0.88);
  });

  it("clears the box it points at by roughly the arrow clearance", () => {
    const result = layoutGraphSync(graph(["a", "b"], [["a", "b"]]));
    const boxes = boxesOf(result);
    const edge = result.edges[0];
    const tip = edge.points[edge.points.length - 1];
    const target = boxes.get("b") as Rect;
    const y = edge.y + tip[1];
    expect(target.y0 - y).toBeGreaterThan(4);
    expect(target.y0 - y).toBeLessThan(14);
  });
});
