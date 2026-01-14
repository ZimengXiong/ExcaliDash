/**
 * Drawings API routes
 * Extracted from index.ts to reduce god file
 */
import { Router } from "express";
import { z } from "zod";
import { PrismaClient, Prisma } from "../generated/client";
import {
  sanitizeDrawingData,
  validateImportedDrawing,
  elementSchema,
  appStateSchema,
} from "../security";
import { parseJsonField, serializeDrawingResponse } from "../utils/helpers";
import {
  buildDrawingsCacheKey,
  getCachedDrawingsBody,
  cacheDrawingsResponse,
  invalidateDrawingsCache,
} from "../utils/cache";

export const createDrawingsRouter = (prisma: PrismaClient) => {
  const router = Router();

  const filesFieldSchema = z
    .union([z.record(z.string(), z.any()), z.null()])
    .optional()
    .transform((value) => (value === null ? undefined : value));

  const drawingBaseSchema = z.object({
    name: z.string().trim().min(1).max(255).optional(),
    collectionId: z.union([z.string().trim().min(1), z.null()]).optional(),
    preview: z.string().nullable().optional(),
  });

  const drawingCreateSchema = drawingBaseSchema
    .extend({
      elements: elementSchema.array().default([]),
      appState: appStateSchema.default({}),
      files: filesFieldSchema,
    })
    .refine(
      (data) => {
        try {
          const sanitized = sanitizeDrawingData(data);
          Object.assign(data, sanitized);
          return true;
        } catch (error) {
          console.error("Sanitization failed:", error);
          return false;
        }
      },
      {
        message: "Invalid or malicious drawing data detected",
      }
    );

  const drawingUpdateSchema = drawingBaseSchema
    .extend({
      elements: elementSchema.array().optional(),
      appState: appStateSchema.optional(),
      files: filesFieldSchema,
    })
    .refine(
      (data) => {
        try {
          const sanitizedData = { ...data };
          if (data.elements !== undefined || data.appState !== undefined) {
            const fullData = {
              elements: Array.isArray(data.elements) ? data.elements : [],
              appState:
                typeof data.appState === "object" && data.appState !== null
                  ? data.appState
                  : {},
              files: data.files || {},
              preview: data.preview,
              name: data.name,
              collectionId: data.collectionId,
            };
            const sanitized = sanitizeDrawingData(fullData);
            sanitizedData.elements = sanitized.elements;
            sanitizedData.appState = sanitized.appState;
            if (data.files !== undefined) sanitizedData.files = sanitized.files;
            if (data.preview !== undefined)
              sanitizedData.preview = sanitized.preview;
            Object.assign(data, sanitizedData);
          }
          return true;
        } catch (error) {
          console.error("Sanitization failed:", error);
          if (
            data.elements === undefined &&
            data.appState === undefined &&
            (data.name !== undefined ||
              data.preview !== undefined ||
              data.collectionId !== undefined)
          ) {
            return true;
          }
          return false;
        }
      },
      {
        message: "Invalid or malicious drawing data detected",
      }
    );

  const respondWithValidationErrors = (
    res: Express.Response,
    issues: z.ZodIssue[]
  ) => {
    (res as any).status(400).json({
      error: "Invalid drawing payload",
      details: issues,
    });
  };

  // GET /drawings - List all drawings
  router.get("/", async (req, res) => {
    try {
      const { search, collectionId, includeData } = req.query;
      const where: any = {};
      const searchTerm =
        typeof search === "string" && search.trim().length > 0
          ? search.trim()
          : undefined;

      if (searchTerm) {
        where.name = { contains: searchTerm };
      }

      let collectionFilterKey = "default";
      if (collectionId === "null") {
        where.collectionId = null;
        collectionFilterKey = "null";
      } else if (collectionId) {
        const normalizedCollectionId = String(collectionId);
        where.collectionId = normalizedCollectionId;
        collectionFilterKey = `id:${normalizedCollectionId}`;
      } else {
        where.OR = [{ collectionId: { not: "trash" } }, { collectionId: null }];
      }

      const shouldIncludeData =
        typeof includeData === "string"
          ? includeData.toLowerCase() === "true" || includeData === "1"
          : false;

      const cacheKey = buildDrawingsCacheKey({
        searchTerm: searchTerm ?? "",
        collectionFilter: collectionFilterKey,
        includeData: shouldIncludeData,
      });

      const cachedBody = getCachedDrawingsBody(cacheKey);
      if (cachedBody) {
        res.setHeader("X-Cache", "HIT");
        res.setHeader("Content-Type", "application/json");
        return res.send(cachedBody);
      }

      const summarySelect: Prisma.DrawingSelect = {
        id: true,
        name: true,
        collectionId: true,
        preview: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      };

      const queryOptions: Prisma.DrawingFindManyArgs = {
        where,
        orderBy: { updatedAt: "desc" },
      };

      if (!shouldIncludeData) {
        queryOptions.select = summarySelect;
      }

      const drawings = await prisma.drawing.findMany(queryOptions);

      let responsePayload: any = drawings;

      if (shouldIncludeData) {
        responsePayload = drawings.map((d: any) => ({
          ...d,
          elements: parseJsonField(d.elements, []),
          appState: parseJsonField(d.appState, {}),
          files: parseJsonField(d.files, {}),
        }));
      }

      const body = cacheDrawingsResponse(cacheKey, responsePayload);
      res.setHeader("X-Cache", "MISS");
      res.setHeader("Content-Type", "application/json");
      return res.send(body);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch drawings" });
    }
  });

  // GET /drawings/:id - Get single drawing
  router.get("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log("[API] Fetching drawing", { id });
      const drawing = await prisma.drawing.findUnique({ where: { id } });

      if (!drawing) {
        console.warn("[API] Drawing not found", { id });
        return res.status(404).json({ error: "Drawing not found" });
      }

      res.json(serializeDrawingResponse(drawing));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch drawing" });
    }
  });

  // POST /drawings - Create drawing
  router.post("/", async (req, res) => {
    try {
      const isImportedDrawing = req.headers["x-imported-file"] === "true";

      if (isImportedDrawing && !validateImportedDrawing(req.body)) {
        return res.status(400).json({
          error: "Invalid imported drawing file",
          message:
            "The imported file contains potentially malicious content or invalid structure",
        });
      }

      const parsed = drawingCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return respondWithValidationErrors(res, parsed.error.issues);
      }

      const payload = parsed.data;
      const drawingName = payload.name ?? "Untitled Drawing";
      const targetCollectionId =
        payload.collectionId === undefined ? null : payload.collectionId;

      const newDrawing = await prisma.drawing.create({
        data: {
          name: drawingName,
          elements: JSON.stringify(payload.elements),
          appState: JSON.stringify(payload.appState),
          collectionId: targetCollectionId,
          preview: payload.preview ?? null,
          files: JSON.stringify(payload.files ?? {}),
        },
      });
      invalidateDrawingsCache();

      res.json(serializeDrawingResponse(newDrawing));
    } catch (error) {
      console.error("Failed to create drawing:", error);
      res.status(500).json({ error: "Failed to create drawing" });
    }
  });

  // PUT /drawings/:id - Update drawing
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const parsed = drawingUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        console.error("[API] Validation failed", {
          id,
          errorCount: parsed.error.issues.length,
          errors: parsed.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
            received:
              issue.path.length > 0 ? req.body?.[issue.path.join(".")] : "root",
          })),
        });
        return respondWithValidationErrors(res, parsed.error.issues);
      }

      const payload = parsed.data;

      const data: any = {
        version: { increment: 1 },
      };

      if (payload.name !== undefined) data.name = payload.name;
      if (payload.elements !== undefined)
        data.elements = JSON.stringify(payload.elements);
      if (payload.appState !== undefined)
        data.appState = JSON.stringify(payload.appState);
      if (payload.files !== undefined) data.files = JSON.stringify(payload.files);
      if (payload.collectionId !== undefined)
        data.collectionId = payload.collectionId;
      if (payload.preview !== undefined) data.preview = payload.preview;

      const updatedDrawing = await prisma.drawing.update({
        where: { id },
        data,
      });
      invalidateDrawingsCache();

      res.json(serializeDrawingResponse(updatedDrawing));
    } catch (error) {
      console.error("[CRITICAL] Update failed:", error);
      res.status(500).json({ error: "Failed to update drawing" });
    }
  });

  // DELETE /drawings/:id - Delete drawing
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.drawing.delete({ where: { id } });
      invalidateDrawingsCache();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete drawing" });
    }
  });

  // POST /drawings/:id/duplicate - Duplicate drawing
  router.post("/:id/duplicate", async (req, res) => {
    try {
      const { id } = req.params;
      const original = await prisma.drawing.findUnique({ where: { id } });

      if (!original) {
        return res.status(404).json({ error: "Original drawing not found" });
      }

      const newDrawing = await prisma.drawing.create({
        data: {
          name: `${original.name} (Copy)`,
          elements: original.elements,
          appState: original.appState,
          files: original.files,
          collectionId: original.collectionId,
          version: 1,
        },
      });
      invalidateDrawingsCache();

      res.json(serializeDrawingResponse(newDrawing));
    } catch (error) {
      res.status(500).json({ error: "Failed to duplicate drawing" });
    }
  });

  return router;
};
