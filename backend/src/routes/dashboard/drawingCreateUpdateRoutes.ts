import express from "express";
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../../generated/client";
import {
  canEditDrawing,
  getDrawingAccess,
  isOwnerAccess,
} from "../../authz/sharing";
import { rewritePreviewForS3 } from "../../fileProcessing";
import {
  getUserTrashCollectionId,
  isTrashCollectionId,
  toInternalTrashCollectionId,
  toPublicTrashCollectionId,
} from "./trash";
import type { DrawingRouteContext } from "./drawingRouteContext";

// A file entry is "blank" when it exists but carries no content (empty
// dataURL). Sanitizer tombstones and transient client state can produce
// these; they must never overwrite an existing entry that still has content.
const isBlankFileEntry = (entry: unknown): boolean => {
  if (!entry || typeof entry !== "object") return true;
  const dataURL = (entry as { dataURL?: unknown }).dataURL;
  if (typeof dataURL === "string") return dataURL.length === 0;
  return false;
};

// Merge incoming files into the existing set by fileId (union). Removal is
// never performed here — only the trim/orphans routes delete files — so a
// save from a client with a partial/stale view of the files object cannot
// delete another client's images. Same-id updates overwrite, except a blank
// incoming entry never clobbers existing content.
const mergeFilesUnion = (
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...existing };
  for (const [fileId, entry] of Object.entries(incoming)) {
    if (
      isBlankFileEntry(entry) &&
      merged[fileId] !== undefined &&
      !isBlankFileEntry(merged[fileId])
    ) {
      continue;
    }
    merged[fileId] = entry;
  }
  return merged;
};

export const registerDrawingCreateUpdateRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    requireAuth,
    optionalAuth,
    asyncHandler,
    validateImportedDrawing,
    drawingCreateSchema,
    drawingUpdateSchema,
    respondWithValidationErrors,
    ensureTrashCollection,
    invalidateDrawingsCache,
    config,
    processFilesForS3,
    parseJsonField,
    getRequestPrincipal,
    respondWithAuthErrorIfPresent,
  } = context;
  app.post(
    "/drawings",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

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

      const payload = parsed.data as {
        name?: string;
        collectionId?: string | null;
        elements: unknown[];
        appState: Record<string, unknown>;
        preview?: string | null;
        files?: Record<string, unknown>;
      };
      const drawingName = payload.name ?? "Untitled Drawing";
      const targetCollectionIdRaw =
        payload.collectionId === undefined ? null : payload.collectionId;
      const targetCollectionId =
        toInternalTrashCollectionId(targetCollectionIdRaw, req.user.id) ?? null;

      if (
        targetCollectionId &&
        !isTrashCollectionId(targetCollectionId, req.user.id)
      ) {
        const collection = await prisma.collection.findFirst({
          where: { id: targetCollectionId },
        });
        if (!collection)
          return res.status(404).json({ error: "Collection not found" });

        // If the collection belongs to someone else, check the user has editor access
        if (collection.userId !== req.user.id) {
          const share = await prisma.collectionShare.findFirst({
            where: {
              collectionId: targetCollectionId,
              granteeUserId: req.user.id,
              role: "edit",
            },
          });
          if (!share)
            return res
              .status(403)
              .json({ error: "No edit access to this collection" });
        }
      } else if (targetCollectionIdRaw === "trash") {
        await ensureTrashCollection(prisma, req.user.id);
      }

      const newDrawingId = uuidv4();
      const originalFiles = payload.files ?? {};
      const processedFiles = await processFilesForS3(
        originalFiles,
        req.user.id,
        newDrawingId,
      );
      const processedPreview = rewritePreviewForS3(
        payload.preview ?? null,
        originalFiles,
        processedFiles,
      );

      const newDrawing = await prisma.drawing.create({
        data: {
          id: newDrawingId,
          name: drawingName,
          elements: JSON.stringify(payload.elements),
          appState: JSON.stringify(payload.appState),
          userId: req.user.id,
          collectionId: targetCollectionId,
          preview: typeof processedPreview === "string" ? processedPreview : null,
          files: JSON.stringify(processedFiles),
        },
      });
      invalidateDrawingsCache();

      return res.json({
        ...newDrawing,
        collectionId: toPublicTrashCollectionId(
          newDrawing.collectionId,
          req.user.id,
        ),
        elements: parseJsonField(newDrawing.elements, []),
        appState: parseJsonField(newDrawing.appState, {}),
        files: parseJsonField(newDrawing.files, {}),
      });
    }),
  );

  app.put(
    "/drawings/:id",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const principal = await getRequestPrincipal(req);

      const { id } = req.params;
      const access = await getDrawingAccess({
        prisma,
        principal,
        drawingId: id,
      });
      if (!canEditDrawing(access)) {
        if (respondWithAuthErrorIfPresent(req, res)) return;
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      const existingDrawing = await prisma.drawing.findUnique({
        where: { id },
      });
      if (!existingDrawing)
        return res.status(404).json({ error: "Drawing not found" });

      const parsed = drawingUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        if (config.nodeEnv === "development") {
          console.error("[API] Validation failed", {
            id,
            errors: parsed.error.issues,
          });
        }
        return respondWithValidationErrors(res, parsed.error.issues);
      }

      const payload = parsed.data as {
        name?: string;
        collectionId?: string | null;
        elements?: unknown[];
        appState?: Record<string, unknown>;
        preview?: string | null;
        files?: Record<string, unknown>;
        version?: number;
      };
      const ownerUserId = existingDrawing.userId;
      const trashCollectionId = getUserTrashCollectionId(ownerUserId);
      const isSceneUpdate =
        payload.elements !== undefined ||
        payload.appState !== undefined ||
        payload.files !== undefined;

      if (isSceneUpdate && payload.version !== undefined && payload.version !== existingDrawing.version) {
        return res.status(409).json({
          error: "Conflict",
          code: "VERSION_CONFLICT",
          message: "Drawing has changed since this editor state was loaded.",
          currentVersion: existingDrawing.version,
        });
      }
      const data: Prisma.DrawingUpdateInput = isSceneUpdate
        ? { version: { increment: 1 } }
        : {};

      if (payload.name !== undefined) data.name = payload.name;
      if (payload.elements !== undefined)
        data.elements = JSON.stringify(payload.elements);
      if (payload.appState !== undefined)
        data.appState = JSON.stringify(payload.appState);
      let processedFilesForUpdate: Record<string, unknown> | undefined;
      if (payload.files !== undefined) {
        processedFilesForUpdate = await processFilesForS3(
          payload.files,
          ownerUserId,
          id,
        );
        // Note: data.files is not assigned here. The union merge with the
        // authoritative current state happens inside the transaction so a
        // concurrent client's files are never whole-replaced away.
      }
      if (payload.preview !== undefined) {
        const processedPreview = processedFilesForUpdate
          ? rewritePreviewForS3(payload.preview, payload.files ?? {}, processedFilesForUpdate)
          : payload.preview;
        data.preview = typeof processedPreview === "string" ? processedPreview : null;
      }

      if (payload.collectionId !== undefined) {
        if (!isOwnerAccess(access)) {
          return res.status(403).json({
            error: "Forbidden",
            message: "Only the owner can move drawings between collections",
          });
        }
        if (payload.collectionId === "trash") {
          await ensureTrashCollection(prisma, ownerUserId);
          (data as Prisma.DrawingUncheckedUpdateInput).collectionId =
            trashCollectionId;
        } else if (payload.collectionId) {
          const collection = await prisma.collection.findFirst({
            where: { id: payload.collectionId, userId: ownerUserId },
          });
          if (!collection)
            return res.status(404).json({ error: "Collection not found" });
          (data as Prisma.DrawingUncheckedUpdateInput).collectionId =
            payload.collectionId;
        } else {
          (data as Prisma.DrawingUncheckedUpdateInput).collectionId = null;
        }
      }

      const updateWhere: Prisma.DrawingWhereInput = { id };
      if (isSceneUpdate && payload.version !== undefined) {
        updateWhere.version = payload.version;
      }

      const versionConflictError = new Error("VERSION_CONFLICT");
      let updatedDrawing: typeof existingDrawing | null = null;

      try {
        if (isSceneUpdate) {
          updatedDrawing = await prisma.$transaction(async (tx) => {
            // Read the authoritative current state inside the transaction so
            // the snapshot and the files union merge both reflect what is
            // actually about to be overwritten (not a stale pre-transaction
            // read that a concurrent writer may have already superseded).
            const current = await tx.drawing.findUnique({ where: { id } });
            if (!current) {
              throw versionConflictError;
            }

            await tx.drawingSnapshot.create({
              data: {
                drawingId: id,
                version: current.version,
                elements: current.elements,
                appState: current.appState,
                files: current.files,
              },
            });

            if (processedFilesForUpdate !== undefined) {
              const existingFiles = parseJsonField<Record<string, unknown>>(
                current.files,
                {},
              );
              data.files = JSON.stringify(
                mergeFilesUnion(existingFiles, processedFilesForUpdate),
              );
            }

            const updateResult = await tx.drawing.updateMany({
              where: updateWhere,
              data,
            });
            if (updateResult.count === 0) {
              throw versionConflictError;
            }

            return tx.drawing.findFirst({ where: { id } });
          });
        } else {
          const updateResult = await prisma.drawing.updateMany({
            where: updateWhere,
            data,
          });
          if (updateResult.count === 0) {
            return res.status(404).json({ error: "Drawing not found" });
          }
          updatedDrawing = await prisma.drawing.findFirst({
            where: { id },
          });
        }
      } catch (error) {
        if (
          error === versionConflictError ||
          (error instanceof Error &&
            error.message === versionConflictError.message)
        ) {
          const latestDrawing = await prisma.drawing.findFirst({
            where: { id },
            select: { version: true },
          });
          if (isSceneUpdate && payload.version !== undefined) {
            return res.status(409).json({
              error: "Conflict",
              code: "VERSION_CONFLICT",
              message:
                "Drawing has changed since this editor state was loaded.",
              currentVersion: latestDrawing?.version ?? null,
            });
          }
        }
        throw error;
      }
      if (!updatedDrawing) {
        return res.status(404).json({ error: "Drawing not found" });
      }
      invalidateDrawingsCache();

      return res.json({
        ...updatedDrawing,
        collectionId: toPublicTrashCollectionId(
          updatedDrawing.collectionId,
          ownerUserId,
        ),
        elements: parseJsonField(updatedDrawing.elements, []),
        appState: parseJsonField(updatedDrawing.appState, {}),
        files: parseJsonField(updatedDrawing.files, {}),
        accessLevel: access,
      });
    }),
  );

};
