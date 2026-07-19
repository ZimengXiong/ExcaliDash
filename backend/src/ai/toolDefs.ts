import { SHAPE_KINDS, STYLE_KEYS } from "../agent/opSchemas";

/**
 * Provider-agnostic tool definitions. `view_canvas` supplies visual context and
 * `apply_ops` mutates the scene using an input schema that mirrors the zod batch in
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
      description:
        "Create a rectangle, ellipse, diamond, text, or frame. A labeled shape automatically grows vertically if wrapped text does not fit its requested height.",
      properties: {
        op: { const: "add_shape" },
        ref: {
          type: "string",
          pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$",
          description:
            'Optional batch-local name. Later ops in this batch can target the created shape as "$name".',
        },
        shape: { type: "string", enum: [...SHAPE_KINDS] },
        x: { type: "number" },
        y: { type: "number" },
        w: {
          type: "number",
          description:
            "Width. Use at least 120 for labeled shapes; for standalone text this is the wrap width.",
        },
        h: {
          type: "number",
          description:
            "Preferred minimum height; use at least 60 for labeled shapes. The harness may grow it to fit the label.",
        },
        label: {
          type: "string",
          description:
            "For frames, the native editable frame title. For other shapes, a bound text label.",
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
      description:
        "Set a text element or shape label. For a frame id, edits its native frame title (name).",
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
      title: "resize",
      description:
        "Resize around the element center. Bound text is rewrapped, height is clamped large enough to contain it, and connected arrows are rerouted.",
      properties: {
        op: { const: "resize" },
        id: { type: "string", description: 'Element id or earlier "$ref".' },
        w: { type: "number", exclusiveMinimum: 0 },
        h: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["op", "id", "w", "h"],
      additionalProperties: false,
    },
    {
      type: "object",
      title: "align",
      description: "Align two or more elements while moving their bound labels.",
      properties: {
        op: { const: "align" },
        ids: {
          type: "array",
          minItems: 2,
          items: { type: "string" },
          description: 'Element ids or earlier "$ref" values.',
        },
        alignment: {
          type: "string",
          enum: ["left", "center", "right", "top", "middle", "bottom"],
        },
      },
      required: ["op", "ids", "alignment"],
      additionalProperties: false,
    },
    {
      type: "object",
      title: "distribute",
      description:
        "Distribute elements in their current spatial order. Supply gap for predictable whitespace.",
      properties: {
        op: { const: "distribute" },
        ids: { type: "array", minItems: 2, items: { type: "string" } },
        direction: { type: "string", enum: ["horizontal", "vertical"] },
        gap: { type: "number", minimum: 0 },
      },
      required: ["op", "ids", "direction"],
      additionalProperties: false,
    },
    {
      type: "object",
      title: "layout",
      description:
        "Place elements as a clean row, column, or grid in ids order. Use this instead of hand-computing many coordinates; connected arrows are rerouted afterward.",
      properties: {
        op: { const: "layout" },
        ids: { type: "array", minItems: 1, items: { type: "string" } },
        direction: { type: "string", enum: ["horizontal", "vertical", "grid"] },
        gap: {
          type: "number",
          minimum: 0,
          maximum: 2000,
          description: "Whitespace between cells; 60-100 is a readable default.",
        },
        columns: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Grid columns only; defaults to a near-square grid.",
        },
        x: { type: "number", description: "Optional layout top-left x." },
        y: { type: "number", description: "Optional layout top-left y." },
      },
      required: ["op", "ids", "direction"],
      additionalProperties: false,
    },
    {
      type: "object",
      title: "group",
      description:
        "Semantically group two or more elements so users can select and move them together.",
      properties: {
        op: { const: "group" },
        ids: { type: "array", minItems: 2, items: { type: "string" } },
      },
      required: ["op", "ids"],
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
    "Use add_shape.ref plus $ref targets to create and connect a whole diagram in one call. " +
    "Prefer layout/align/distribute over manual coordinate arithmetic. Keep labeled shapes " +
    "at least 120×60 with 60-100px gaps; labeled shapes auto-grow vertically to fit " +
    "wrapped text. Use restrained consistent colors and inspect returned overlap or " +
    "label-overflow warnings. The batch is atomic: any invalid op rejects all changes.",
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

export const VIEW_CANVAS_TOOL: AgentTool = {
  name: "view_canvas",
  description:
    "Inspect a PNG rendering of the canvas as it looked when the user sent this message. " +
    "New user turns normally attach that rendering automatically, so do not call this " +
    "when the message says an image is attached. The structural summary supplies ids.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

export const AGENT_TOOLS: AgentTool[] = [VIEW_CANVAS_TOOL, APPLY_OPS_TOOL];
