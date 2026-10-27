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

export type ShapeKind = (typeof SHAPE_KINDS)[number];

// Shapes a laid-out graph node can take. `text` and `frame` are excluded: a node
// is a container the layout measures and an arrow can bind to.
export const LAYOUT_SHAPE_KINDS = ["rectangle", "ellipse", "diamond"] as const;

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

// Draw a whole graph from structure alone. `add_shape` needs x/y, which puts the
// caller in charge of placement — the thing models are worst at. Here the caller
// supplies nodes and edges and the server derives the geometry with dagre.
//
// `key` is batch-local: it lets edges reference nodes created in the same op,
// without the caller knowing the element ids up front.
// Label length is capped because the box is sized from it: an unbounded label
// would produce an unbounded box.
export const MAX_LAYOUT_LABEL_LENGTH = 500;

// dagre's cost grows sharply with the number of back edges rather than with size
// alone: a densely cyclic graph at this ceiling takes seconds. It runs on a
// worker thread (see layoutRunner.ts) with a timeout, so a slow solve costs the
// caller latency instead of blocking every other request, which is what allows
// these to be generous. They still exist because the result has to fit in a
// message and a drawing.
export const MAX_LAYOUT_NODES = 200;
export const MAX_LAYOUT_EDGES = 400;

const layoutNodeSchema = z.object({
  key: z.string().min(1).max(200),
  label: z.string().max(MAX_LAYOUT_LABEL_LENGTH).optional(),
  shape: z.enum(LAYOUT_SHAPE_KINDS).optional(),
  style: styleSchema.optional(),
});

const layoutEdgeSchema = z.object({
  from: z.string().min(1).max(200),
  to: z.string().min(1).max(200),
  label: z.string().max(MAX_LAYOUT_LABEL_LENGTH).optional(),
  style: styleSchema.optional(),
  arrowType: z.enum(["arrow", "line"]).optional(),
});

const layoutSchema = z.object({
  op: z.literal("layout"),
  nodes: z.array(layoutNodeSchema).min(1).max(MAX_LAYOUT_NODES),
  edges: z.array(layoutEdgeSchema).max(MAX_LAYOUT_EDGES).optional(),
  direction: z.enum(["TB", "BT", "LR", "RL"]).optional(),
  // Where the laid-out graph is placed. Defaults to the origin.
  x: z.number().optional(),
  y: z.number().optional(),
});

export const opSchema = z.discriminatedUnion("op", [
  addShapeSchema,
  layoutSchema,
  connectSchema,
  setTextSchema,
  setStyleSchema,
  moveSchema,
  deleteSchema,
  importElementsSchema,
  revertToSnapshotSchema,
]);

// Per-op ceilings bound one graph; these bound a whole request. Without them a
// batch of 50 layout ops could ask for 10,000 nodes, and the solver would work
// through them one after another while everyone else waited their turn.
export const MAX_BATCH_LAYOUT_NODES = 300;
export const MAX_BATCH_LAYOUT_EDGES = 600;

export const opsBatchSchema = z
  .object({
    ops: z.array(opSchema).min(1).max(50),
    clientBatchId: z.string().max(200).optional(),
  })
  .superRefine((batch, ctx) => {
    let nodes = 0;
    let edges = 0;
    for (const op of batch.ops) {
      if (op.op !== "layout") continue;
      nodes += op.nodes.length;
      edges += (op.edges ?? []).length;
    }
    if (nodes > MAX_BATCH_LAYOUT_NODES) {
      ctx.addIssue({
        code: "custom",
        path: ["ops"],
        message: `Batch lays out ${nodes} nodes; the limit across one batch is ${MAX_BATCH_LAYOUT_NODES}`,
      });
    }
    if (edges > MAX_BATCH_LAYOUT_EDGES) {
      ctx.addIssue({
        code: "custom",
        path: ["ops"],
        message: `Batch lays out ${edges} edges; the limit across one batch is ${MAX_BATCH_LAYOUT_EDGES}`,
      });
    }
  });

export type Op = z.infer<typeof opSchema>;
export type AddShapeOp = z.infer<typeof addShapeSchema>;
export type LayoutOp = z.infer<typeof layoutSchema>;
export type ConnectOp = z.infer<typeof connectSchema>;
export type SetTextOp = z.infer<typeof setTextSchema>;
export type SetStyleOp = z.infer<typeof setStyleSchema>;
export type MoveOp = z.infer<typeof moveSchema>;
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
    | "SNAPSHOT_NOT_FOUND"
    | "UNSUPPORTED"
    | "LAYOUT_FAILED";
  message: string;
  elementId?: string;
};
