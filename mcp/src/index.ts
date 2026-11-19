#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { configFromEnv, ExcaliDashClient } from "./excalidash.js";
import { AliasScope } from "./operations.js";
import { findElements, MAX_IMAGE_BASE64 } from "./scene.js";

const style = z.record(z.string(), z.unknown());
const id = z.string().min(1);

const op = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_shape"),
    ref: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
      .optional(),
    shape: z.enum(["rectangle", "ellipse", "diamond", "text", "frame"]),
    x: z.number(),
    y: z.number(),
    w: z.number().positive().optional(),
    h: z.number().positive().optional(),
    label: z.string().optional(),
    style: style.optional(),
  }),
  z.object({
    op: z.literal("connect"),
    fromId: id,
    toId: id,
    label: z.string().optional(),
    style: style.optional(),
    arrowType: z.enum(["arrow", "line"]).optional(),
  }),
  z.object({ op: z.literal("set_text"), id, text: z.string() }),
  z.object({ op: z.literal("set_style"), id, style }),
  z
    .object({
      op: z.literal("move"),
      id,
      dx: z.number().optional(),
      dy: z.number().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    })
    .refine((value) => {
      const relative = value.dx !== undefined || value.dy !== undefined;
      const absolute = value.x !== undefined || value.y !== undefined;
      return relative !== absolute;
    }, "move requires either (dx,dy) or (x,y), not both"),
  z.object({
    op: z.literal("layout"),
    nodes: z
      .array(
        z.object({
          key: z.string().min(1).max(200),
          label: z.string().max(500).optional(),
          shape: z.enum(["rectangle", "ellipse", "diamond"]).optional(),
          style: style.optional(),
        }),
      )
      .min(1)
      .max(200),
    edges: z
      .array(
        z.object({
          from: z.string().min(1).max(200),
          to: z.string().min(1).max(200),
          label: z.string().max(500).optional(),
          style: style.optional(),
          arrowType: z.enum(["arrow", "line"]).optional(),
        }),
      )
      .max(400)
      .optional(),
    direction: z.enum(["TB", "BT", "LR", "RL"]).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
  z.object({ op: z.literal("delete"), id }),
  z.object({
    op: z.literal("import_elements"),
    elements: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  }),
  z.object({
    op: z.literal("revert_to_snapshot"),
    version: z.number().int().nonnegative(),
  }),
]);

const textResult = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

const errorResult = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: error instanceof Error ? error.message : String(error),
    },
  ],
  isError: true,
});

export const createServer = (
  client: ExcaliDashClient,
  initialDrawingId?: string,
): McpServer => {
  const server = new McpServer({ name: "excalidash-mcp", version: "0.3.1" });
  let selectedDrawingId = initialDrawingId;
  const aliases = new AliasScope();

  const resolveDrawingId = (drawingId?: string): string => {
    const resolved = drawingId ?? selectedDrawingId;
    if (!resolved) {
      throw new Error(
        "No drawing selected. Call list_drawings and select_drawing first, or pass drawingId.",
      );
    }
    return resolved;
  };

  server.registerTool(
    "list_drawings",
    {
      description:
        "List ExcaliDash drawings available to the account API key. Use this before selecting a drawing.",
      inputSchema: z.object({
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().nonnegative().default(0),
      }),
    },
    async ({ search, limit, offset }) => {
      try {
        const result = await client.listDrawings({ search, limit, offset });
        return textResult(
          JSON.stringify({ selectedDrawingId, ...result }, null, 2),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "select_drawing",
    {
      description:
        "Select an Excalidraw drawing as the default target for subsequent tools in this MCP process.",
      inputSchema: z.object({ drawingId: id }),
    },
    async ({ drawingId }) => {
      try {
        const drawing = await client.getDrawing(drawingId);
        if (drawing.engine !== undefined && drawing.engine !== "excalidraw") {
          throw new Error(
            `Drawing ${drawingId} uses ${drawing.engine}; Agent API operations support Excalidraw only.`,
          );
        }
        selectedDrawingId = drawing.id;
        return textResult(
          JSON.stringify(
            { selectedDrawingId, name: drawing.name, version: drawing.version },
            null,
            2,
          ),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_selected_drawing",
    {
      description: "Return the drawing currently selected by this MCP process.",
      inputSchema: z.object({}),
    },
    async () =>
      textResult(
        selectedDrawingId
          ? JSON.stringify({ selectedDrawingId })
          : "No drawing selected.",
      ),
  );

  server.registerTool(
    "create_drawing",
    {
      description:
        "Create a new empty Excalidraw drawing and optionally select it as the default target.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(200),
        select: z.boolean().default(true),
      }),
    },
    async ({ name, select }) => {
      try {
        const drawing = await client.createDrawing(name);
        if (select) selectedDrawingId = drawing.id;
        return textResult(
          JSON.stringify({ selected: select, drawing }, null, 2),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_drawing_summary",
    {
      description:
        "Read a compact structural summary of a drawing. Uses drawingId when provided, otherwise the selected drawing.",
      inputSchema: z.object({ drawingId: id.optional() }),
    },
    async ({ drawingId }) => {
      try {
        return textResult(await client.getSummary(resolveDrawingId(drawingId)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "inspect_drawing_element",
    {
      description:
        "Inspect one element and its bound children. Uses drawingId when provided, otherwise the selected drawing.",
      inputSchema: z.object({
        drawingId: id.optional(),
        elementId: id,
      }),
    },
    async ({ drawingId, elementId }) => {
      try {
        return textResult(
          JSON.stringify(
            await client.inspectElement(resolveDrawingId(drawingId), elementId),
            null,
            2,
          ),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "apply_drawing_ops",
    {
      description:
        "Atomically apply up to 50 semantic operations. Uses drawingId when provided, otherwise the selected drawing. Read the summary first.",
      inputSchema: z.object({
        drawingId: id.optional(),
        ops: z
          .array(op)
          .min(1)
          .max(50)
          .superRefine((ops, ctx) => {
            let nodes = 0,
              edges = 0;
            for (const item of ops)
              if (item.op === "layout") {
                nodes += item.nodes.length;
                edges += item.edges?.length ?? 0;
              }
            if (nodes > 300 || edges > 600)
              ctx.addIssue({
                code: "custom",
                message: "Batch graph limit exceeded (300 nodes / 600 edges)",
              });
          }),
        clientBatchId: z.string().max(200).optional(),
      }),
    },
    async ({ drawingId, ops, clientBatchId }) => {
      try {
        const resolved = resolveDrawingId(drawingId);
        const result = await client.applyOps(
          resolved,
          aliases.prepare(resolved, ops),
          clientBatchId,
        );
        const refs = aliases.commit(resolved, ops, result);
        return textResult(JSON.stringify({ ...result, refs }, null, 2));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  const jsonCall = async (action: () => Promise<unknown>) => {
    try {
      return textResult(JSON.stringify(await action(), null, 2));
    } catch (error) {
      return errorResult(error);
    }
  };
  const drawingName = z.string().trim().min(1).max(200);
  const collectionName = z.string().trim().min(1).max(100);
  server.registerTool(
    "rename_drawing",
    {
      description: "Rename a drawing by ID.",
      inputSchema: z.object({ drawingId: id, name: drawingName }),
    },
    ({ drawingId, name }) =>
      jsonCall(() => client.updateDrawing(drawingId, { name })),
  );
  server.registerTool(
    "get_drawing",
    {
      description:
        "Get full scene and version. Files may be authenticated references, not embedded bytes.",
      inputSchema: z.object({ drawingId: id }),
    },
    ({ drawingId }) => jsonCall(() => client.getDrawing(drawingId)),
  );
  server.registerTool(
    "find_elements",
    {
      description:
        "AND filters: exact id/type and case-sensitive literal text substring. Excludes deleted elements.",
      inputSchema: z.object({
        drawingId: id,
        id: id.optional(),
        type: z.string().min(1).max(100).optional(),
        text: z.string().max(1000).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().nonnegative().default(0),
      }),
    },
    ({ drawingId, ...query }) =>
      jsonCall(async () =>
        findElements(await client.getDrawing(drawingId), query),
      ),
  );
  server.registerTool(
    "delete_drawing",
    {
      description: "Permanently delete a drawing. This is not a move to Trash.",
      annotations: { destructiveHint: true },
      inputSchema: z.object({ drawingId: id }),
    },
    ({ drawingId }) =>
      jsonCall(async () => {
        const result = await client.deleteDrawing(drawingId);
        if (result.success !== true)
          throw new Error("Deletion was not confirmed");
        aliases.forget(drawingId);
        if (selectedDrawingId === drawingId) selectedDrawingId = undefined;
        return result;
      }),
  );
  server.registerTool(
    "list_collections",
    {
      description:
        "List owned and shared collections with server ownership metadata.",
      inputSchema: z.object({}),
    },
    () => jsonCall(() => client.listCollections()),
  );
  server.registerTool(
    "create_collection",
    {
      description: "Create an owned collection.",
      inputSchema: z.object({ name: collectionName }),
    },
    ({ name }) => jsonCall(() => client.createCollection(name)),
  );
  server.registerTool(
    "rename_collection",
    {
      description: "Rename an owned collection. Trash cannot be renamed.",
      inputSchema: z.object({ collectionId: id, name: collectionName }),
    },
    ({ collectionId, name }) =>
      jsonCall(() => client.renameCollection(collectionId, name)),
  );
  server.registerTool(
    "delete_collection",
    {
      description:
        "Delete an owned collection and its shares; drawings remain unorganized. Trash cannot be deleted.",
      annotations: { destructiveHint: true },
      inputSchema: z.object({ collectionId: id }),
    },
    ({ collectionId }) => jsonCall(() => client.deleteCollection(collectionId)),
  );
  server.registerTool(
    "move_drawing_to_collection",
    {
      description:
        "Move a drawing to an existing collection, or null for unorganized.",
      inputSchema: z.object({ drawingId: id, collectionId: id.nullable() }),
    },
    ({ drawingId, collectionId }) =>
      jsonCall(() => client.updateDrawing(drawingId, { collectionId })),
  );
  server.registerTool(
    "add_image",
    {
      description:
        "Add PNG/JPEG bytes with optimistic version checking. No URL fetch or S3 credentials. Conflicts are not retried.",
      inputSchema: z.object({
        drawingId: id,
        mimeType: z.enum(["image/png", "image/jpeg"]),
        base64: z.string().min(1).max(MAX_IMAGE_BASE64),
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().finite().positive(),
        height: z.number().finite().positive(),
      }),
    },
    ({ drawingId, ...input }) =>
      jsonCall(() => client.addImage(drawingId, input)),
  );

  return server;
};

const main = async (): Promise<void> => {
  const config = configFromEnv();
  const server = createServer(new ExcaliDashClient(config), config.drawingId);
  await server.connect(new StdioServerTransport());
};

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
