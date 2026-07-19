import { describe, expect, it } from "vitest";
import { applyOps } from "./applyOps";
import type { Op } from "./opSchemas";
import { buildStructuralSummary } from "./summary";

const apply = (ops: Op[], elements: any[] = []) => {
  const result = applyOps({ ops, elements });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result;
};

describe("agent semantic layout operations", () => {
  it("resolves add_shape refs inside one atomic diagram batch", () => {
    const result = apply([
      { op: "add_shape", ref: "api", shape: "rectangle", x: 0, y: 0, label: "API" },
      { op: "add_shape", ref: "db", shape: "rectangle", x: 0, y: 0, label: "Database" },
      { op: "connect", fromId: "$api", toId: "$db", label: "reads" },
      { op: "layout", ids: ["$api", "$db"], direction: "horizontal", gap: 80 },
    ]);

    const shapes = result.elements.filter((el) => el.type === "rectangle");
    expect(shapes).toHaveLength(2);
    expect(shapes[1].x - (shapes[0].x + shapes[0].width)).toBe(80);
    const arrow = result.elements.find((el) => el.type === "arrow");
    expect(arrow.startBinding.elementId).toBe(shapes[0].id);
    expect(arrow.endBinding.elementId).toBe(shapes[1].id);
    expect(arrow.x).toBe(shapes[0].x + shapes[0].width);
    expect(arrow.points[1][0]).toBe(80);
  });

  it("rejects forward and duplicate references without returning a partial scene", () => {
    const forward = applyOps({
      elements: [],
      ops: [
        { op: "connect", fromId: "$later", toId: "existing" },
        { op: "add_shape", ref: "later", shape: "rectangle", x: 0, y: 0 },
      ],
    });
    expect(forward).toMatchObject({
      ok: false,
      errors: [{ opIndex: 0, code: "INVALID_REFERENCE" }],
    });

    const duplicate = applyOps({
      elements: [],
      ops: [
        { op: "add_shape", ref: "node", shape: "rectangle", x: 0, y: 0 },
        { op: "add_shape", ref: "node", shape: "ellipse", x: 0, y: 0 },
      ],
    });
    expect(duplicate).toMatchObject({
      ok: false,
      errors: [{ opIndex: 1, code: "DUPLICATE_REF" }],
    });
  });

  it("aligns, distributes, groups, resizes, and reroutes bound arrows", () => {
    const seed = [
      { id: "a", type: "rectangle", x: 0, y: 10, width: 100, height: 60, isDeleted: false },
      { id: "b", type: "rectangle", x: 300, y: 80, width: 100, height: 60, isDeleted: false },
      {
        id: "edge",
        type: "arrow",
        x: 100,
        y: 40,
        width: 200,
        height: 70,
        points: [[0, 0], [200, 70]],
        startBinding: { elementId: "a" },
        endBinding: { elementId: "b" },
        isDeleted: false,
      },
    ];
    const result = apply(
      [
        { op: "resize", id: "a", w: 160, h: 80 },
        { op: "align", ids: ["a", "b"], alignment: "middle" },
        { op: "distribute", ids: ["a", "b"], direction: "horizontal", gap: 90 },
        { op: "group", ids: ["a", "b"] },
      ],
      seed,
    );
    const a = result.elements.find((el) => el.id === "a");
    const b = result.elements.find((el) => el.id === "b");
    const edge = result.elements.find((el) => el.id === "edge");
    expect(a.width).toBe(160);
    expect(a.y + a.height / 2).toBe(b.y + b.height / 2);
    expect(b.x - (a.x + a.width)).toBe(90);
    expect(a.groupIds[0]).toBe(b.groupIds[0]);
    expect(edge.x).toBe(a.x + a.width);
    expect(edge.points[1][0]).toBe(90);
    expect(result.changedIds).toContain("edge");
  });

  it("wraps bound labels to the shape width and reports actionable scene context", () => {
    const result = apply([
      {
        op: "add_shape",
        shape: "rectangle",
        x: 10,
        y: 20,
        w: 120,
        h: 60,
        label: "A long label that should wrap inside the node",
      },
      { op: "add_shape", shape: "ellipse", x: 50, y: 30, w: 120, h: 60 },
    ]);
    const label = result.elements.find((el) => el.type === "text");
    expect(label.text).toContain("\n");
    expect(label.width).toBeLessThanOrEqual(100);
    expect(label.autoResize).toBe(false);

    const summary = buildStructuralSummary({
      name: "Architecture",
      version: 3,
      elements: result.elements,
      appState: { scrollX: -10, scrollY: 5, zoom: { value: 0.8 } },
    });
    expect(summary).toContain("scene bounds:");
    expect(summary).toContain("types:");
    expect(summary).toContain("viewport:");
    expect(summary).toContain("warnings: overlaps");
  });
});
