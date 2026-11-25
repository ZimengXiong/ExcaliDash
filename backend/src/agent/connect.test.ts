import { describe, expect, it } from "vitest";
import { applyOps } from "./applyOps";
import { ARROW_CLEARANCE } from "./layoutGeometry";

const box = (id: string, x: number, y: number, type = "rectangle") => ({
  id,
  type,
  x,
  y,
  width: 100,
  height: 60,
  isDeleted: false,
  boundElements: null,
});

const run = (elements: any[], ops: any[]) => {
  const out = applyOps({ ops, elements });
  if (!out.ok) throw new Error(JSON.stringify(out.errors));
  return out;
};

const abs = (arrow: any) =>
  arrow.points.map(([x, y]: number[]) => ({ x: arrow.x + x, y: arrow.y + y }));

describe("connect", () => {
  it("runs border to border with clearance, not centre to centre", () => {
    const out = run(
      [box("a", 0, 0), box("b", 300, 0)],
      [{ op: "connect", fromId: "a", toId: "b" }],
    );
    const arrow = out.elements.find((e) => e.type === "arrow")!;
    const [start, end] = abs(arrow);
    expect(start).toEqual({ x: 100 + ARROW_CLEARANCE, y: 30 });
    expect(end).toEqual({ x: 300 - ARROW_CLEARANCE, y: 30 });
    expect(arrow.startBinding.elementId).toBe("a");
    expect(arrow.endBinding.elementId).toBe("b");
    const a = out.elements.find((e) => e.id === "a")!;
    const b = out.elements.find((e) => e.id === "b")!;
    expect(a.boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);
    expect(b.boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);
  });

  it("lands on the real outline of an ellipse and a diamond", () => {
    const out = run(
      [box("a", 0, 0, "ellipse"), box("b", 100, 300, "diamond")],
      [{ op: "connect", fromId: "a", toId: "b" }],
    );
    const arrow = out.elements.find((e) => e.type === "arrow")!;
    const [start, end] = abs(arrow);
    // Diagonal: inside the bounding box corners, on the curved/slanted outline.
    const e = { x: (start.x - 50) / 50, y: (start.y - 30) / 30 };
    expect(Math.hypot(e.x, e.y)).toBeGreaterThan(1);
    expect(Math.hypot(e.x, e.y)).toBeLessThan(1.4);
    const d = Math.abs(end.x - 150) / 50 + Math.abs(end.y - 330) / 30;
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(1.4);
  });

  it("gives arrows into one shape distinct endpoints", () => {
    const out = run(
      [box("hub", 300, 300), box("n", 300, 0), box("w", 0, 300), box("s", 300, 600)],
      [
        { op: "connect", fromId: "n", toId: "hub" },
        { op: "connect", fromId: "w", toId: "hub" },
        { op: "connect", fromId: "s", toId: "hub" },
      ],
    );
    const ends = out.elements
      .filter((e) => e.type === "arrow")
      .map((a) => JSON.stringify(abs(a).at(-1)));
    expect(new Set(ends).size).toBe(3);
  });

  it("fans repeated connections between the same pair apart", () => {
    const out = run(
      [box("a", 0, 0), box("b", 300, 0)],
      [
        { op: "connect", fromId: "a", toId: "b" },
        { op: "connect", fromId: "b", toId: "a" },
      ],
    );
    const [one, two] = out.elements.filter((e) => e.type === "arrow");
    expect(abs(one)[0].y).not.toBe(abs(two).at(-1).y);
  });

  it("binds the label to the arrow and centres it on the arrow midpoint", () => {
    const out = run(
      [box("a", 0, 0), box("b", 300, 0)],
      [{ op: "connect", fromId: "a", toId: "b", label: "calls" }],
    );
    const arrow = out.elements.find((e) => e.type === "arrow")!;
    const label = out.elements.find((e) => e.type === "text")!;
    expect(label.containerId).toBe(arrow.id);
    expect(arrow.boundElements).toEqual([{ id: label.id, type: "text" }]);
    const [s, e] = abs(arrow);
    expect(label.x + label.width / 2).toBeCloseTo((s.x + e.x) / 2, -1);
    expect(label.y + label.height / 2).toBeCloseTo((s.y + e.y) / 2, -1);
  });

  it("draws an orthogonal elbow arrow between facing sides", () => {
    const out = run(
      [box("a", 0, 0), box("b", 300, 200)],
      [{ op: "connect", fromId: "a", toId: "b", routing: "elbow" }],
    );
    const arrow = out.elements.find((e) => e.type === "arrow")!;
    expect(arrow.elbowed).toBe(true);
    const pts = abs(arrow);
    expect(pts).toHaveLength(4);
    for (let i = 0; i + 1 < pts.length; i++) {
      const horizontal = pts[i].y === pts[i + 1].y;
      const vertical = pts[i].x === pts[i + 1].x;
      expect(horizontal || vertical).toBe(true);
    }
    expect(pts[0]).toEqual({ x: 100 + ARROW_CLEARANCE, y: 30 });
    expect(pts[3]).toEqual({ x: 300 - ARROW_CLEARANCE, y: 230 });
    expect(arrow.startBinding.fixedPoint).toEqual([1, 0.5001]);
    expect(arrow.endBinding.fixedPoint).toEqual([0, 0.5001]);
  });

  it("centres a shape's label inside it", () => {
    const out = run(
      [],
      [{ op: "add_shape", shape: "rectangle", x: 0, y: 0, w: 200, h: 80, label: "Hi" }],
    );
    const label = out.elements.find((e) => e.type === "text")!;
    expect(label.x + label.width / 2).toBeCloseTo(100, -1);
    expect(label.y + label.height / 2).toBeCloseTo(40, -1);
  });

  it("keeps a self-connection visible as an unbound arc", () => {
    const out = run(
      [box("a", 0, 0)],
      [{ op: "connect", fromId: "a", toId: "a" }],
    );
    const arrow = out.elements.find((e) => e.type === "arrow")!;
    expect(arrow.points.length).toBe(4);
    expect(arrow.startBinding).toBeNull();
  });
});
