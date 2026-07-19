import { z } from "zod";

/**
 * Single source of truth for the agent op batch. These zod schemas validate
 * both the REST body of POST /drawings/:id/ops and (later) the LLM tool-call
 * arguments. The applier (applyOps.ts) owns id/seed/versionNonce/binding
 * integrity; the model only supplies the semantic parameters below.
 */

export const SHAPE_KINDS = [
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "frame",
] as const;

// Whitelisted style keys. Anything outside this set is rejected by the applier
// with INVALID_STYLE_KEY (the schema keeps unknown keys so the applier can name
// them in the error rather than silently dropping them).
export const STYLE_KEYS = [
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "opacity",
  "roughness",
  "fontSize",
  "fontFamily",
  "textAlign",
  "roundness",
] as const;

const styleSchema = z.record(z.string(), z.any());

const addShapeSchema = z.object({
  op: z.literal("add_shape"),
  ref: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).optional(),
  shape: z.enum(SHAPE_KINDS),
  x: z.number(),
  y: z.number(),
  w: z.number().positive().optional(),
  h: z.number().positive().optional(),
  label: z.string().optional(),
  style: styleSchema.optional(),
});

const connectSchema = z.object({
  op: z.literal("connect"),
  fromId: z.string().min(1),
  toId: z.string().min(1),
  label: z.string().optional(),
  style: styleSchema.optional(),
  arrowType: z.enum(["arrow", "line"]).optional(),
});

const setTextSchema = z.object({
  op: z.literal("set_text"),
  id: z.string().min(1),
  text: z.string(),
});

const setStyleSchema = z.object({
  op: z.literal("set_style"),
  id: z.string().min(1),
  style: styleSchema,
});

// move accepts either a relative delta (dx,dy) or an absolute target (x,y),
// never both. Enforced with a refinement so the applier receives one or the
// other unambiguously.
const moveSchema = z
  .object({
    op: z.literal("move"),
    id: z.string().min(1),
    dx: z.number().optional(),
    dy: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .refine(
    (v) => {
      const hasDelta = v.dx !== undefined || v.dy !== undefined;
      const hasAbs = v.x !== undefined || v.y !== undefined;
      return hasDelta !== hasAbs; // exactly one mode
    },
    { message: "move requires either (dx,dy) or (x,y), not both" },
  );

const resizeSchema = z.object({
  op: z.literal("resize"),
  id: z.string().min(1),
  w: z.number().positive(),
  h: z.number().positive(),
});

const alignSchema = z.object({
  op: z.literal("align"),
  ids: z.array(z.string().min(1)).min(2).max(100),
  alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
});

const distributeSchema = z.object({
  op: z.literal("distribute"),
  ids: z.array(z.string().min(1)).min(2).max(100),
  direction: z.enum(["horizontal", "vertical"]),
  gap: z.number().nonnegative().optional(),
});

const layoutSchema = z.object({
  op: z.literal("layout"),
  ids: z.array(z.string().min(1)).min(1).max(100),
  direction: z.enum(["horizontal", "vertical", "grid"]),
  gap: z.number().nonnegative().max(2000).optional(),
  columns: z.number().int().positive().max(20).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const groupSchema = z.object({
  op: z.literal("group"),
  ids: z.array(z.string().min(1)).min(2).max(100),
});

const deleteSchema = z.object({
  op: z.literal("delete"),
  id: z.string().min(1),
});

const importElementsSchema = z.object({
  op: z.literal("import_elements"),
  elements: z.array(z.record(z.string(), z.any())).min(1).max(5000),
});

const revertToSnapshotSchema = z.object({
  op: z.literal("revert_to_snapshot"),
  version: z.number().int().nonnegative(),
});

export const opSchema = z.discriminatedUnion("op", [
  addShapeSchema,
  connectSchema,
  setTextSchema,
  setStyleSchema,
  moveSchema,
  resizeSchema,
  alignSchema,
  distributeSchema,
  layoutSchema,
  groupSchema,
  deleteSchema,
  importElementsSchema,
  revertToSnapshotSchema,
]);

export const opsBatchSchema = z.object({
  ops: z.array(opSchema).min(1).max(50),
  clientBatchId: z.string().max(200).optional(),
});

export type Op = z.infer<typeof opSchema>;
export type AddShapeOp = z.infer<typeof addShapeSchema>;
export type ConnectOp = z.infer<typeof connectSchema>;
export type SetTextOp = z.infer<typeof setTextSchema>;
export type SetStyleOp = z.infer<typeof setStyleSchema>;
export type MoveOp = z.infer<typeof moveSchema>;
export type ResizeOp = z.infer<typeof resizeSchema>;
export type AlignOp = z.infer<typeof alignSchema>;
export type DistributeOp = z.infer<typeof distributeSchema>;
export type LayoutOp = z.infer<typeof layoutSchema>;
export type GroupOp = z.infer<typeof groupSchema>;
export type DeleteOp = z.infer<typeof deleteSchema>;
export type ImportElementsOp = z.infer<typeof importElementsSchema>;
export type RevertToSnapshotOp = z.infer<typeof revertToSnapshotSchema>;
export type OpsBatch = z.infer<typeof opsBatchSchema>;

export type OpError = {
  opIndex: number;
  code:
    | "ELEMENT_NOT_FOUND"
    | "INVALID_STYLE_KEY"
    | "INVALID_OP"
    | "DUPLICATE_REF"
    | "INVALID_REFERENCE"
    | "INVALID_ELEMENT_SET"
    | "SNAPSHOT_NOT_FOUND"
    | "UNSUPPORTED";
  message: string;
  elementId?: string;
};
