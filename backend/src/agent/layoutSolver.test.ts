import { describe, expect, it } from "vitest";
import { layoutGraphSync } from "./layout";
import type { LayoutGraphInput } from "./layoutTypes";

const finite = (n: number) => Number.isFinite(n);

const graph = (
  keys: string[],
  edges: [string, string, string?][],
  direction: LayoutGraphInput["direction"] = "TB",
): LayoutGraphInput => ({
  nodes: keys.map((key) => ({ key, label: key })),
  edges: edges.map(([from, to, label]) => ({ from, to, label })),
  direction,
});

describe("solver input mapping", () => {
  // graphlib stores nodes in a plain object, so these keys used to resolve
  // against Object.prototype and come back as NaN.
  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"])(
    "places a node keyed %s",
    (key) => {
      const result = layoutGraphSync(graph([key, "other"], [[key, "other"]]));
      expect(result.nodes).toHaveLength(2);
      for (const node of result.nodes) {
        expect(finite(node.x) && finite(node.y)).toBe(true);
      }
      // The two boxes must actually be laid out, not stacked at the origin.
      const [a, b] = result.nodes;
      expect(a.x !== b.x || a.y !== b.y).toBe(true);
    },
  );

  it("places nodes keyed with arbitrary unicode", () => {
    const keys = ["🎯 ziel", "ünïcode", "日本語", "a b"];
    const result = layoutGraphSync(
      graph(keys, [
        [keys[0], keys[1]],
        [keys[1], keys[2]],
        [keys[2], keys[3]],
      ]),
    );
    expect(result.nodes.map((n) => n.key)).toEqual(keys);
    for (const node of result.nodes) {
      expect(finite(node.x) && finite(node.y)).toBe(true);
    }
  });

  it("keeps every parallel edge even though the solver only sees one", () => {
    const result = layoutGraphSync(
      graph(
        ["a", "b"],
        [
          ["a", "b", "first"],
          ["a", "b", "second"],
          ["a", "b", "third"],
        ],
      ),
    );
    expect(result.edges).toHaveLength(3);
    expect(result.edges.map((e) => e.label?.text)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  // Three parallel edges inside a cycle made dagre throw "Not possible to find
  // intersection inside of the rectangle". Two did not.
  it("solves a cycle carrying three parallel edges", () => {
    const result = layoutGraphSync(
      graph(
        ["n0", "n1", "n2", "n3", "n4"],
        [
          ["n4", "n2", "e1"],
          ["n1", "n3", "e3"],
          ["n1", "n2"],
          ["n2", "n4"],
          ["n1", "n2", "e6"],
          ["n3", "n4"],
          ["n1", "n2"],
          ["n0", "n1"],
          ["n0", "n3", "e11"],
        ],
      ),
    );
    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(9);
  });
});

describe("solver determinism", () => {
  // dagre caches the previous call's graph at module scope, which made a solve
  // depend on what the process happened to lay out before it.
  it("returns the same geometry regardless of what was solved before", () => {
    // This exact pair differs when the cache is on: laying out `neighbour`
    // between two solves of `subject` moves the boxes.
    const subject = graph(
      ["k0", "k1", "k2", "k3", "k4"],
      [
        ["k2", "k4"],
        ["k2", "k4"],
        ["k0", "k4", "L2"],
        ["k0", "k4", "L3"],
        ["k1", "k0", "L4"],
        ["k3", "k4"],
      ],
      "TB",
    );
    const neighbour = graph(
      ["k0", "k1", "k2", "k3", "k4", "k5"],
      [
        ["k3", "k2", "L0"],
        ["k5", "k0"],
        ["k0", "k0"],
        ["k4", "k5"],
        ["k5", "k4", "L4"],
        ["k2", "k0"],
      ],
      "LR",
    );

    const first = JSON.stringify(layoutGraphSync(subject));
    layoutGraphSync(neighbour);
    expect(JSON.stringify(layoutGraphSync(subject))).toBe(first);
  });

  // A pseudo-random corpus in one process: every one of these used to be
  // solvable alone, and some of them were not solvable in sequence.
  it("solves a seeded corpus of cyclic multigraphs without throwing", () => {
    let seed = 0x12345678;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let g = 0; g < 200; g += 1) {
      const size = 3 + Math.floor(rnd() * 6);
      const keys = Array.from({ length: size }, (_, i) => `n${i}`);
      const edges: [string, string, string?][] = [];
      const count = size + Math.floor(rnd() * size * 2);
      for (let i = 0; i < count; i += 1) {
        edges.push([
          `n${Math.floor(rnd() * size)}`,
          `n${Math.floor(rnd() * size)}`,
          rnd() < 0.4 ? `e${i}` : undefined,
        ]);
      }
      const direction = (["TB", "LR", "BT", "RL"] as const)[g % 4];
      expect(() => layoutGraphSync(graph(keys, edges, direction))).not.toThrow();
    }
  });
});
