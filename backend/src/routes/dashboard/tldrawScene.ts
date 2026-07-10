import { z } from "zod";

export const DRAWING_ENGINES = ["excalidraw", "tldraw"] as const;
export type DrawingEngine = (typeof DRAWING_ENGINES)[number];

// Engine is chosen at creation and immutable afterwards. Defaulting to
// "excalidraw" means existing clients that never send `engine` keep working
// byte-for-byte as before.
export const engineCreateFieldSchema = z
  .enum(DRAWING_ENGINES)
  .default("excalidraw");

// tldraw record ids look like "shape:abc", "page:xyz", "document:document".
const tldrawRecordIdPattern = /^[a-zA-Z][a-zA-Z0-9_]*:.+/;

// A single tldraw store record: opaque except that every record carries a
// string `id` and `typeName`. Everything else passes through untouched — the
// scene is only ever re-parsed by tldraw's loadSnapshot on the client and is
// never interpolated into the DOM (preview + name are the sanitized surfaces).
const tldrawRecordSchema = z
  .object({ id: z.string().min(1), typeName: z.string().min(1) })
  .passthrough();

const tldrawStoreSchema = z
  .record(z.string(), tldrawRecordSchema)
  .refine(
    (store) =>
      Object.keys(store).every((key) => tldrawRecordIdPattern.test(key)),
    { message: "Invalid tldraw record id in store" },
  );

// getSnapshot(store).document shape: { store: {...records}, schema: {...} }.
// `.strict()` rejects any unknown top-level scene key.
export const tldrawDocumentSchema = z
  .object({
    store: tldrawStoreSchema,
    schema: z.record(z.string(), z.unknown()),
  })
  .strict();

// tldraw's own session snapshot (camera/page/selection) or {}. Not precious.
const tldrawAppStateSchema = z.record(z.string(), z.unknown());

// tldraw assets live inline in the store; the per-file DrawingFile store is
// excalidraw-fileId-shaped. Accept an absent or empty files object and reject a
// non-empty one, normalizing to undefined so interning never runs for a tldraw
// row.
const tldrawFilesSchema = z
  .union([z.record(z.string(), z.unknown()), z.null()])
  .optional()
  .superRefine((value, ctx) => {
    if (value && Object.keys(value).length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tldraw drawings must not carry interned files",
      });
    }
  })
  .transform(() => undefined);

const tldrawBaseSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  collectionId: z.union([z.string().trim().min(1), z.null()]).optional(),
  preview: z.string().nullable().optional(),
});

export const tldrawCreateSchema = tldrawBaseSchema.extend({
  engine: z.literal("tldraw"),
  elements: tldrawDocumentSchema,
  appState: tldrawAppStateSchema.default({}),
  files: tldrawFilesSchema,
});

export const tldrawUpdateSchema = tldrawBaseSchema.extend({
  elements: tldrawDocumentSchema.optional(),
  appState: tldrawAppStateSchema.optional(),
  files: tldrawFilesSchema,
  version: z.number().int().positive().optional(),
});

// Serialized-size guard shared by create and update. Uses the UTF-8 byte length
// of the document, matching what is stored in the TEXT column.
export const tldrawSceneExceedsCap = (
  document: unknown,
  maxBytes: number,
): boolean => {
  if (document === undefined) return false;
  return Buffer.byteLength(JSON.stringify(document), "utf8") > maxBytes;
};

export const tldrawSceneTooLargeBody = (maxBytes: number) => ({
  error: "Payload too large",
  code: "TLDRAW_SCENE_TOO_LARGE",
  message: `tldraw scene exceeds the maximum allowed size of ${Math.round(
    maxBytes / (1024 * 1024),
  )}MB`,
});
