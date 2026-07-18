import { describe, expect, it } from "vitest";
import { applyOps } from "./applyOps";
import { buildStructuralSummary } from "./summary";

describe("native frame title agent semantics", () => {
  it("uses add_shape label as the native title without creating bound text", () => {
    const result = applyOps({
      elements: [],
      ops: [{
        op: "add_shape",
        shape: "frame",
        x: 10,
        y: 20,
        w: 400,
        h: 300,
        label: "Control Plane",
      }],
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.elements).toHaveLength(1);
    expect(result.results[0].createdIds).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({
      type: "frame",
      name: "Control Plane",
    });
    expect(buildStructuralSummary({
      name: "Drawing",
      version: 1,
      elements: result.elements,
    })).toContain('title="Control Plane"');
  });

  it("renames the frame while preserving its independent bound section label", () => {
    const elements = [
      {
        id: "frame-1",
        type: "frame",
        name: "hello",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        boundElements: [{ id: "section-label", type: "text" }],
        isDeleted: false,
      },
      {
        id: "section-label",
        type: "text",
        text: "3. API REQUEST FLOW",
        originalText: "3. API REQUEST FLOW",
        containerId: "frame-1",
        x: 100,
        y: 100,
        width: 200,
        height: 25,
        isDeleted: false,
      },
    ];
    const before = buildStructuralSummary({ name: "Drawing", version: 1, elements });
    expect(before).toContain('frame-1 frame 0,0 400×300 title="hello"');
    expect(before).toContain('"3. API REQUEST FLOW"  in:frame-1');

    const result = applyOps({
      elements,
      ops: [{ op: "set_text", id: "frame-1", text: "Request\x00 Lifecycle" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.elements.find((element) => element.id === "frame-1")?.name)
      .toBe("Request Lifecycle");
    expect(result.elements.find((element) => element.id === "section-label")?.text)
      .toBe("3. API REQUEST FLOW");
  });

  it("exposes untitled frames explicitly", () => {
    const summary = buildStructuralSummary({
      name: "Drawing",
      version: 1,
      elements: [{
        id: "frame-empty",
        type: "frame",
        name: null,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        isDeleted: false,
      }],
    });
    expect(summary).toContain("title=<untitled>");
  });
});
