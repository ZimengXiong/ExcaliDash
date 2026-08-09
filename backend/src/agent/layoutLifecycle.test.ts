import { describe, expect, it } from "vitest";
import { applyOps } from "./applyOps";
import type { ExcalidrawElement } from "./elementFactory";
import { validateLayoutOp } from "./applyLayout";
import { wrapLabel } from "./layoutText";
import {
  MAX_BATCH_LAYOUT_EDGES,
  MAX_BATCH_LAYOUT_NODES,
  opsBatchSchema,
} from "./opSchemas";

const apply = (ops: any[], elements: ExcalidrawElement[] = []) => {
  const out = applyOps({ ops, elements });
  if (out.ok === false) throw new Error(JSON.stringify(out.errors));
  return out;
};

const live = (elements: ExcalidrawElement[], id: string) =>
  elements.find((el) => el.id === id);

describe("detached edge labels", () => {
  // A self-loop cannot use a bound label: Excalidraw puts one at the arrow
  // midpoint, and binding both ends of a loop to one shape collapses it. The
  // label is therefore placed by hand, which used to leave it with no relation
  // to anything, so move and delete walked straight past it.
  const loopScene = () => {
    const out = apply([
      {
        op: "layout",
        nodes: [{ key: "a", label: "Retry" }],
        edges: [{ from: "a", to: "a", label: "on error" }],
      },
    ]);
    const arrow = out.elements.find((el) => el.type === "arrow") as ExcalidrawElement;
    const node = out.elements.find((el) => el.type === "rectangle") as ExcalidrawElement;
    const labelId = (arrow.customData as { layoutLabelId?: string } | undefined)
      ?.layoutLabelId;
    return { out, arrow, node, labelId };
  };

  it("records the label on the arrow that carries it", () => {
    const { labelId, out } = loopScene();
    expect(typeof labelId).toBe("string");
    expect(live(out.elements, labelId as string)?.text).toBe("on error");
  });

  it("moves a self-loop label along with its arrow", () => {
    const { out, arrow, labelId } = loopScene();
    const before = live(out.elements, labelId as string) as ExcalidrawElement;
    const at = { x: before.x, y: before.y };
    const moved = apply([{ op: "move", id: arrow.id, dx: 100, dy: 50 }], out.elements);
    const after = live(moved.elements, labelId as string) as ExcalidrawElement;
    expect(after.x).toBe(at.x + 100);
    expect(after.y).toBe(at.y + 50);
  });

  it("deletes a self-loop label along with its arrow", () => {
    const { out, arrow, labelId } = loopScene();
    const deleted = apply([{ op: "delete", id: arrow.id }], out.elements);
    expect(live(deleted.elements, labelId as string)?.isDeleted).toBe(true);
  });

  it("does the same for the labels of parallel edges", () => {
    const out = apply([
      {
        op: "layout",
        nodes: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
        edges: [
          { from: "a", to: "b", label: "first" },
          { from: "a", to: "b", label: "second" },
        ],
      },
    ]);
    const arrows = out.elements.filter((el) => el.type === "arrow");
    const labelIds = arrows.map(
      (a) => (a.customData as { layoutLabelId?: string } | undefined)?.layoutLabelId,
    );
    expect(labelIds.filter(Boolean)).toHaveLength(2);

    const deleted = apply([{ op: "delete", id: arrows[0].id }], out.elements);
    expect(live(deleted.elements, labelIds[0] as string)?.isDeleted).toBe(true);
    // …and only that one.
    expect(live(deleted.elements, labelIds[1] as string)?.isDeleted).toBeFalsy();
  });
});

describe("layout preflight", () => {
  it("rejects duplicate keys, unknown endpoints and unknown style keys", () => {
    const duplicate = validateLayoutOp({
      op: "layout",
      nodes: [{ key: "a" }, { key: "a" }],
    } as any);
    expect(duplicate?.code).toBe("INVALID_OP");

    const dangling = validateLayoutOp({
      op: "layout",
      nodes: [{ key: "a" }],
      edges: [{ from: "a", to: "ghost" }],
    } as any);
    expect(dangling?.message).toContain("ghost");

    const badStyle = validateLayoutOp({
      op: "layout",
      nodes: [{ key: "a", style: { evil: "x" } }],
    } as any);
    expect(badStyle?.code).toBe("INVALID_STYLE_KEY");

    const badEdgeStyle = validateLayoutOp({
      op: "layout",
      nodes: [{ key: "a" }, { key: "b" }],
      edges: [{ from: "a", to: "b", style: { evil: "x" } }],
    } as any);
    expect(badEdgeStyle?.code).toBe("INVALID_STYLE_KEY");

    expect(
      validateLayoutOp({
        op: "layout",
        nodes: [{ key: "a" }, { key: "b" }],
        edges: [{ from: "a", to: "b", style: { strokeColor: "#000" } }],
      } as any),
    ).toBeNull();
  });
});

describe("batch layout budget", () => {
  const layoutOp = (nodeCount: number) => ({
    op: "layout",
    nodes: Array.from({ length: nodeCount }, (_, i) => ({ key: `n${i}` })),
  });

  it("accepts a batch within the budget", () => {
    const parsed = opsBatchSchema.safeParse({
      ops: [layoutOp(150), layoutOp(150)],
    });
    expect(parsed.success).toBe(true);
  });

  // Each op is within its own ceiling, so only an aggregate limit catches this:
  // fifty of them would have queued 10,000 nodes behind one another.
  it("rejects a batch that stacks many full-size layouts", () => {
    const parsed = opsBatchSchema.safeParse({
      ops: Array.from({ length: 50 }, () => layoutOp(200)),
    });
    expect(parsed.success).toBe(false);
    const message = parsed.success ? "" : parsed.error.issues.map((i) => i.message).join(" ");
    expect(message).toContain(String(MAX_BATCH_LAYOUT_NODES));
  });

  it("rejects a batch that stacks many full-size edge sets", () => {
    const withEdges = {
      op: "layout",
      nodes: [{ key: "a" }, { key: "b" }],
      edges: Array.from({ length: 400 }, () => ({ from: "a", to: "b" })),
    };
    const parsed = opsBatchSchema.safeParse({ ops: [withEdges, withEdges] });
    expect(parsed.success).toBe(false);
    const message = parsed.success ? "" : parsed.error.issues.map((i) => i.message).join(" ");
    expect(message).toContain(String(MAX_BATCH_LAYOUT_EDGES));
  });
});

describe("label wrapping across unicode", () => {
  const lonelySurrogates = (lines: string[]) =>
    lines.filter((line) => {
      const first = line.charCodeAt(0);
      const last = line.charCodeAt(line.length - 1);
      return (last >= 0xd800 && last <= 0xdbff) || (first >= 0xdc00 && first <= 0xdfff);
    }).length;

  // length and slice count UTF-16 code units, so cutting a line at a fixed count
  // used to split an emoji into two halves across two lines.
  it.each([
    ["emoji", `a${"😀".repeat(60)}`],
    ["flags", "🇩🇪".repeat(40)],
    ["family with joiners", "👨‍👩‍👧‍👦".repeat(20)],
    ["combining marks", "é".repeat(60)],
  ])("keeps %s intact when a long word is broken", (_name, text) => {
    const lines = wrapLabel(text, 16);
    expect(lonelySurrogates(lines)).toBe(0);
    expect(lines.join("")).toBe(text);
  });
});
