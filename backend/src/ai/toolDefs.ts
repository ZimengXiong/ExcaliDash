import { SHAPE_KINDS, STYLE_KEYS } from "../agent/opSchemas";

/**
 * Provider-agnostic tool definition. The chat proxy exposes exactly one tool —
 * `apply_ops` — whose input schema mirrors the zod op batch in
 * ../agent/opSchemas.ts. The SHAPE_KINDS / STYLE_KEYS constants are imported
 * from that single source so the tool schema can never drift from the applier's
 * whitelist. revert_to_snapshot (undo) and import_elements (raw-JSON escape
 * hatch) are intentionally NOT exposed to the model; they remain REST-only.
 */
export type AgentTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const styleObject = {
  type: "object",
  description:
    "Visual style patch. Only whitelisted keys are applied; unknown keys are rejected.",
  properties: Object.fromEntries(STYLE_KEYS.map((k) => [k, {}])),
  additionalProperties: false,
} as const;

const opSchema = {
  oneOf: [
    {
      type: "object",
      title: "add_shape",
      description: "Create a rectangle, ellipse, diamond, text, or frame.",
      properties: {
        op: { const: "add_shape" },
        shape: { type: "string", enum: [...SHAPE_KINDS] },
        x: { type: "number" },
        y: { type: "number" },
        w: { type: "number", description: "Width (optional)." },
        h: { type: "number", description: "Height (optional)." },
        label: {
          type: "string",
          description: "Bound text label placed inside the shape.",
        },
        style: styleObject,
      },
      required: ["op", "shape", "x", "y"],
      additionalProperties: false,
    },
    {
      type: "object",
      title: "connect",
      description:
        "Draw an arrow (or line) between two existing elements, binding both endpoints.",
      properties: {
        op: { const: "connect" },
        fromId: { type: "string" },
        toId: { type: "string" },
        label: { type: "string" },
        style: styleObject,
        arrowType: { type: "string", enum: ["arrow", "line"] },
      },
      required: ["op", "fromId", "toId"],
      additionalProperties: false,
    },
    {
      type: "object",
      title: "set_text",
      description: "Set the text of an element or its bound label.",
      properties: {
        op: { const: "set_text" },
        id: { type: "string" },
        text: { type: "string" },
      },
      required: ["op", "id", "text"],
      additionalProperties: false,
    },
    {
      type: "object",
      title: "set_style",
      description: "Apply a whitelisted style patch to an element.",
      properties: {
        op: { const: "set_style" },
        id: { type: "string" },
        style: styleObject,
      },
      required: ["op", "id", "style"],
      additionalProperties: false,
    },
    {
      type: "object",
      title: "move",
      description:
        "Move an element by a relative delta (dx,dy) XOR to an absolute point (x,y).",
      properties: {
        op: { const: "move" },
        id: { type: "string" },
        dx: { type: "number" },
        dy: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["op", "id"],
      additionalProperties: false,
    },
    {
      type: "object",
      title: "delete",
      description: "Soft-delete an element and its bound label.",
      properties: {
        op: { const: "delete" },
        id: { type: "string" },
      },
      required: ["op", "id"],
      additionalProperties: false,
    },
  ],
} as const;

export const APPLY_OPS_TOOL: AgentTool = {
  name: "apply_ops",
  description:
    "Apply a batch of semantic drawing operations to the current Excalidraw canvas. " +
    "Element ids come from the structural summary in the system prompt. The batch " +
    "is applied atomically: if any op is invalid the whole batch is rejected.",
  inputSchema: {
    type: "object",
    properties: {
      ops: {
        type: "array",
        minItems: 1,
        maxItems: 50,
        items: opSchema,
      },
    },
    required: ["ops"],
    additionalProperties: false,
  },
};

export const AGENT_TOOLS: AgentTool[] = [APPLY_OPS_TOOL];
