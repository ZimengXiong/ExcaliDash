import express from "express";
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../../generated/client";
import {
  canEditDrawing,
  getDrawingAccess,
  isOwnerAccess,
} from "../../authz/sharing";
import { rewritePreviewForInternedFiles } from "../../fileProcessing";
import {
  getUserTrashCollectionId,
  isTrashCollectionId,
  toInternalTrashCollectionId,
  toPublicTrashCollectionId,
} from "./trash";
import type { DrawingRouteContext } from "./drawingRouteContext";
import { applySceneUpdateTx, isVersionConflict } from "./sceneUpdate";

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
    internDrawingFiles,
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
      const processedFiles = await internDrawingFiles(
        originalFiles,
        req.user.id,
        newDrawingId,
      );
      const processedPreview = rewritePreviewForInternedFiles(
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
      // `version` is owned by applySceneUpdateTx for scene updates; do not set
      // it here.
      const data: Prisma.DrawingUpdateInput = {};

      if (payload.name !== undefined) data.name = payload.name;
      if (payload.elements !== undefined)
        data.elements = JSON.stringify(payload.elements);
      if (payload.appState !== undefined)
        data.appState = JSON.stringify(payload.appState);
      let processedFilesForUpdate: Record<string, unknown> | undefined;
      if (payload.files !== undefined) {
        processedFilesForUpdate = await internDrawingFiles(
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
          ? rewritePreviewForInternedFiles(payload.preview, payload.files ?? {}, processedFilesForUpdate)
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

      let updatedDrawing: typeof existingDrawing | null = null;

      try {
        if (isSceneUpdate) {
          const result = await applySceneUpdateTx({
            prisma,
            drawingId: id,
            parseJsonField,
            versionGuard: payload.version !== undefined ? payload.version : "none",
            mutate: () => ({ data, incomingFiles: processedFilesForUpdate }),
          });
          updatedDrawing = result.drawing;
        } else {
          const updateResult = await prisma.drawing.updateMany({
            where: { id },
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
        if (isVersionConflict(error)) {
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
