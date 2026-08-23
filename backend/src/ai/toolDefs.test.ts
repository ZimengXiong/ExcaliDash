import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, APPLY_OPS_TOOL } from "./toolDefs";
import {
  LAYOUT_SHAPE_KINDS,
  MAX_LAYOUT_EDGES,
  MAX_LAYOUT_LABEL_LENGTH,
  MAX_LAYOUT_NODES,
  SHAPE_KINDS,
  STYLE_KEYS,
  opSchema,
} from "../agent/opSchemas";

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

  // The tool schema is written by hand while the applier is driven by zod, so
  // the two can drift: a new op reaches the REST API and the built-in assistant
  // never learns it exists. Anything deliberately withheld belongs on this list,
  // where leaving it out is a decision rather than an oversight.
  const WITHHELD_FROM_MODEL = ["import_elements", "revert_to_snapshot"];

  it("offers the model every op except the ones deliberately withheld", () => {
    const applierOps = opSchema.options.map(
      (option: any) => option.shape.op.value as string,
    );
    const offered = (APPLY_OPS_TOOL.inputSchema as any).properties.ops.items.oneOf.map(
      (o: any) => o.title as string,
    );
    expect(applierOps.length).toBeGreaterThan(offered.length);
    expect([...offered, ...WITHHELD_FROM_MODEL].sort()).toEqual([...applierOps].sort());
  });

  it("describes the layout op with the shapes the applier accepts", () => {
    const ops = (APPLY_OPS_TOOL.inputSchema as any).properties.ops.items.oneOf;
    const layout = ops.find((o: any) => o.title === "layout");
    expect(layout).toBeDefined();
    expect(layout.required).toEqual(["op", "nodes"]);
    expect(layout.properties.nodes.items.properties.shape.enum).toEqual([
      ...LAYOUT_SHAPE_KINDS,
    ]);
    expect(layout.properties.direction.enum).toEqual(["TB", "BT", "LR", "RL"]);
    expect(layout.properties.nodes.maxItems).toBe(MAX_LAYOUT_NODES);
    expect(layout.properties.edges.maxItems).toBe(MAX_LAYOUT_EDGES);
    expect(layout.properties.nodes.items.properties.key).toMatchObject({
      minLength: 1,
      maxLength: 200,
    });
    expect(layout.properties.nodes.items.properties.label.maxLength).toBe(
      MAX_LAYOUT_LABEL_LENGTH,
    );
    expect(layout.properties.edges.items.properties.from).toMatchObject({
      minLength: 1,
      maxLength: 200,
    });
    expect(layout.properties.edges.items.properties.label.maxLength).toBe(
      MAX_LAYOUT_LABEL_LENGTH,
    );
  });
});
