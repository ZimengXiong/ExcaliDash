import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, APPLY_OPS_TOOL } from "./toolDefs";
import { SHAPE_KINDS, STYLE_KEYS } from "../agent/opSchemas";

describe("ai/toolDefs", () => {
  it("exposes exactly the apply_ops tool", () => {
    expect(AGENT_TOOLS).toHaveLength(1);
    expect(AGENT_TOOLS[0]).toBe(APPLY_OPS_TOOL);
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
});
