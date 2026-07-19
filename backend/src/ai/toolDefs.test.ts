import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, APPLY_OPS_TOOL, VIEW_CANVAS_TOOL } from "./toolDefs";
import { SHAPE_KINDS, STYLE_KEYS } from "../agent/opSchemas";

describe("ai/toolDefs", () => {
  it("exposes visual inspection before the mutation tool", () => {
    expect(AGENT_TOOLS).toEqual([VIEW_CANVAS_TOOL, APPLY_OPS_TOOL]);
    expect(VIEW_CANVAS_TOOL.name).toBe("view_canvas");
    expect(APPLY_OPS_TOOL.name).toBe("apply_ops");
  });

  it("bounds the batch and requires ops", () => {
    const schema = APPLY_OPS_TOOL.inputSchema as any;
    expect(schema.required).toContain("ops");
    expect(schema.properties.ops.maxItems).toBe(50);
    expect(schema.properties.ops.minItems).toBe(1);
  });

  it("derives shape enum from the op schema source constants", () => {
    const ops = (APPLY_OPS_TOOL.inputSchema as any).properties.ops.items.oneOf;
    const addShape = ops.find((o: any) => o.title === "add_shape");
    expect(addShape.properties.shape.enum).toEqual([...SHAPE_KINDS]);
  });

  it("restricts style keys to the whitelist and no others", () => {
    const ops = (APPLY_OPS_TOOL.inputSchema as any).properties.ops.items.oneOf;
    const setStyle = ops.find((o: any) => o.title === "set_style");
    const keys = Object.keys(setStyle.properties.style.properties);
    expect(keys.sort()).toEqual([...STYLE_KEYS].sort());
    expect(setStyle.properties.style.additionalProperties).toBe(false);
  });

  it("does not expose revert_to_snapshot or import_elements to the model", () => {
    const ops = (APPLY_OPS_TOOL.inputSchema as any).properties.ops.items.oneOf;
    const titles = ops.map((o: any) => o.title);
    expect(titles).not.toContain("revert_to_snapshot");
    expect(titles).not.toContain("import_elements");
  });

  it("exposes semantic layout operations and batch-local references", () => {
    const ops = (APPLY_OPS_TOOL.inputSchema as any).properties.ops.items.oneOf;
    const titles = ops.map((o: any) => o.title);
    expect(titles).toEqual(
      expect.arrayContaining(["resize", "align", "distribute", "layout", "group"]),
    );
    const addShape = ops.find((o: any) => o.title === "add_shape");
    expect(addShape.properties.ref.pattern).toContain("A-Za-z");
    expect(APPLY_OPS_TOOL.description).toContain("$ref");
  });
});
