import { describe, expect, it } from "vitest";
import { applyOps } from "./applyOps";
import type { ExcalidrawElement } from "./elementFactory";
import { layoutGraphSync as layoutGraph } from "./layout";
import { measureNode, wrapLabel } from "./layoutText";

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const pipeline = {
  nodes: [
    { key: "ingest", label: "Event Ingestion Gateway" },
    { key: "queue", label: "Kafka" },
    { key: "stream", label: "Stream Worker" },
    { key: "batch", label: "Batch Worker" },
    { key: "store", label: "ClickHouse Analytics Store" },
    { key: "dlq", label: "Dead Letter Queue" },
  ],
  edges: [
    { from: "ingest", to: "queue", label: "publish" },
    { from: "queue", to: "stream", label: "consume" },
    { from: "queue", to: "batch" },
    { from: "stream", to: "store", label: "write" },
    { from: "batch", to: "store" },
    { from: "queue", to: "dlq", label: "on failure" },
  ],
};

describe("wrapLabel", () => {
  it("keeps a short label on one line", () => {
    expect(wrapLabel("Kafka", 16)).toEqual(["Kafka"]);
  });

  it("wraps a long label instead of producing a wide strip", () => {
    const lines = wrapLabel("Event Ingestion Gateway Service Layer", 16);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("Event Ingestion Gateway Service Layer");
  });
});

describe("measureNode", () => {
  it("grows the box with the label rather than using a fixed size", () => {
    const short = measureNode("Kafka", 16);
    const long = measureNode("ClickHouse Analytics Store", 16);
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("never returns a box below the readable minimum", () => {
    const tiny = measureNode("a", 16);
    expect(tiny.width).toBeGreaterThanOrEqual(140);
    expect(tiny.height).toBeGreaterThanOrEqual(60);
  });

  it("handles a node with no label", () => {
    const none = measureNode(undefined, 16);
    expect(none.text).toBeUndefined();
    expect(none.width).toBeGreaterThan(0);
  });
});

describe("layoutGraph", () => {
  it("places every node without overlapping any other", () => {
    const { nodes } = layoutGraph({ ...pipeline, direction: "LR" });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(
          overlaps(nodes[i], nodes[j]),
          `${nodes[i].key} overlaps ${nodes[j].key}`,
        ).toBe(false);
      }
    }
  });

  it("honours the direction", () => {
    const lr = layoutGraph({ ...pipeline, direction: "LR" });
    const tb = layoutGraph({ ...pipeline, direction: "TB" });
    expect(lr.width).toBeGreaterThan(lr.height);
    expect(tb.height).toBeGreaterThan(tb.width);
  });

  it("offsets the whole graph by the requested origin", () => {
    const at0 = layoutGraph({ ...pipeline, originX: 0, originY: 0 });
    const at500 = layoutGraph({ ...pipeline, originX: 500, originY: 300 });
    expect(at500.nodes[0].x - at0.nodes[0].x).toBe(500);
    expect(at500.nodes[0].y - at0.nodes[0].y).toBe(300);
  });

  it("binds a single edge label to the arrow", () => {
    const { edges } = layoutGraph({
      nodes: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
      edges: [{ from: "a", to: "b", label: "calls" }],
    });
    expect(edges[0].label?.bound).toBe(true);
  });

  it("separates labels of edges running between the same pair", () => {
    const { edges } = layoutGraph({
      nodes: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
      edges: [
        { from: "a", to: "b", label: "request" },
        { from: "b", to: "a", label: "response" },
      ],
    });
    // What matters is that the two captions are readable side by side, not how
    // they got there: the solver routes opposing edges apart, so each label can
    // sit on its own arrow.
    const distance = Math.hypot(
      (edges[0].label?.x ?? 0) - (edges[1].label?.x ?? 0),
      (edges[0].label?.y ?? 0) - (edges[1].label?.y ?? 0),
    );
    expect(distance).toBeGreaterThan(40);
  });

  it("routes parallel edges as separate lanes", () => {
    const { edges } = layoutGraph({
      nodes: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "b" },
      ],
    });
    // Two arrows between the same pair have to be individually visible, so no
    // point of one may land on the other. Their shape is the solver's business.
    const absolute = edges.map((edge) =>
      edge.points.map(([px, py]) => [edge.x + px, edge.y + py] as const),
    );
    for (const point of absolute[0]) {
      for (const other of absolute[1]) {
        expect(Math.hypot(point[0] - other[0], point[1] - other[1])).toBeGreaterThan(8);
      }
    }
  });

  it("gives a self-loop real geometry instead of a zero-length arrow", () => {
    const { edges } = layoutGraph({
      nodes: [{ key: "a", label: "Retry" }],
      edges: [{ from: "a", to: "a", label: "on error" }],
    });
    expect(edges).toHaveLength(1);
    const span = edges[0].points.reduce(
      (max, [px, py]) => Math.max(max, Math.abs(px), Math.abs(py)),
      0,
    );
    expect(span).toBeGreaterThan(0);
  });

  it("stacks multiple self-loops on one node so they stay distinguishable", () => {
    const { edges } = layoutGraph({
      nodes: [{ key: "a", label: "Retry" }],
      edges: [
        { from: "a", to: "a" },
        { from: "a", to: "a" },
      ],
    });
    expect(edges[0].points).not.toEqual(edges[1].points);
  });

  it("splits a long unbroken label instead of widening the box without limit", () => {
    const long = "x".repeat(400);
    const box = measureNode(long, 16);
    expect(box.width).toBeLessThanOrEqual(300);
    expect(box.text?.split("\n").length).toBeGreaterThan(1);
  });

  it("treats a whitespace-only label as no label", () => {
    expect(measureNode("   ", 16).text).toBeUndefined();
  });

  it("skips edges whose endpoints are not in the node set", () => {
    const { edges } = layoutGraph({
      nodes: [{ key: "a", label: "A" }],
      edges: [{ from: "a", to: "ghost" }],
    });
    expect(edges).toHaveLength(0);
  });
});

describe("layout op", () => {
  const run = (op: Record<string, unknown>, elements: ExcalidrawElement[] = []) =>
    applyOps({ ops: [op as never], elements });

  it("creates shapes, labels and bound arrows in one op", () => {
    const out = run({
      op: "layout",
      direction: "LR",
      nodes: [
        { key: "a", label: "Web App" },
        { key: "b", label: "API Gateway" },
      ],
      edges: [{ from: "a", to: "b", label: "POST /orders" }],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    const shapes = out.elements.filter((el) => el.type === "rectangle");
    const arrows = out.elements.filter((el) => el.type === "arrow");
    expect(shapes).toHaveLength(2);
    expect(arrows).toHaveLength(1);

    // Both ends bound, so the arrow follows when a box is dragged.
    expect(arrows[0].startBinding?.elementId).toBe(shapes[0].id);
    expect(arrows[0].endBinding?.elementId).toBe(shapes[1].id);
    for (const shape of shapes) {
      expect(shape.boundElements).toEqual(
        expect.arrayContaining([{ id: arrows[0].id, type: "arrow" }]),
      );
    }
  });

  it("centres each label inside its box", () => {
    const out = run({
      op: "layout",
      nodes: [{ key: "a", label: "Event Ingestion Gateway" }],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const box = out.elements.find((el) => el.type === "rectangle")!;
    const label = out.elements.find((el) => el.type === "text")!;
    // x/y are a text element's top-left corner, so the centres are what must
    // line up — passing the centre straight to the factory offsets the label.
    expect(label.x + label.width / 2).toBeCloseTo(box.x + box.width / 2, 0);
    expect(label.y + label.height / 2).toBeCloseTo(box.y + box.height / 2, 0);
  });

  it("keeps every label inside the bounds of its box", () => {
    const out = run({
      op: "layout",
      nodes: [
        { key: "a", label: "ClickHouse Analytics Store" },
        { key: "b", label: "DB" },
      ],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const label of out.elements.filter((el) => el.type === "text")) {
      const box = out.elements.find((el) => el.id === label.containerId)!;
      expect(label.x).toBeGreaterThanOrEqual(box.x);
      expect(label.y).toBeGreaterThanOrEqual(box.y);
      expect(label.x + label.width).toBeLessThanOrEqual(box.x + box.width);
      expect(label.y + label.height).toBeLessThanOrEqual(box.y + box.height);
    }
  });

  it("sizes each box around its own label", () => {
    const out = run({
      op: "layout",
      nodes: [
        { key: "short", label: "DB" },
        { key: "long", label: "ClickHouse Analytics Store" },
      ],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const [short, long] = out.elements.filter((el) => el.type === "rectangle");
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("renders arrows behind the shapes they connect", () => {
    const out = run({
      op: "layout",
      nodes: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
      edges: [{ from: "a", to: "b" }],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const firstShape = out.elements.findIndex((el) => el.type === "rectangle");
    const arrow = out.elements.findIndex((el) => el.type === "arrow");
    expect(arrow).toBeLessThan(firstShape);
  });

  it("rejects an edge referencing an unknown node key", () => {
    const out = run({
      op: "layout",
      nodes: [{ key: "a", label: "A" }],
      edges: [{ from: "a", to: "ghost" }],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors[0].code).toBe("INVALID_OP");
    expect(out.errors[0].message).toContain("ghost");
  });

  it("rejects duplicate node keys", () => {
    const out = run({
      op: "layout",
      nodes: [{ key: "a", label: "A" }, { key: "a", label: "Also A" }],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors[0].message).toContain("Duplicate node key");
  });

  it("rejects an unknown style key like any other op", () => {
    const out = run({
      op: "layout",
      nodes: [{ key: "a", label: "A", style: { notAStyle: 1 } }],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors[0].code).toBe("INVALID_STYLE_KEY");
  });

  it("leaves elements already on the board untouched", () => {
    const existing: ExcalidrawElement[] = [
      { id: "keep-me", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
    ];
    const out = run(
      { op: "layout", nodes: [{ key: "a", label: "A" }] },
      existing,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.elements.find((el) => el.id === "keep-me")).toBeDefined();
  });
});

describe("self-loop op", () => {
  it("does not bind both ends of a self-loop to the same shape", () => {
    const out = applyOps({
      ops: [
        {
          op: "layout",
          nodes: [{ key: "a", label: "Worker" }],
          edges: [{ from: "a", to: "a", label: "retry" }],
        } as never,
      ],
      elements: [],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const arrow = out.elements.find((el) => el.type === "arrow")!;
    // Binding both ends to one shape collapses the arc onto a single point.
    expect(arrow.startBinding).toBeNull();
    expect(arrow.endBinding).toBeNull();
    // It still has real extent, and the node still references it for cleanup.
    expect(Math.abs(arrow.height)).toBeGreaterThan(0);
    const box = out.elements.find((el) => el.type === "rectangle")!;
    expect(box.boundElements).toEqual(
      expect.arrayContaining([{ id: arrow.id, type: "arrow" }]),
    );
  });
});
