import express from "express";
import { v4 as uuidv4 } from "uuid";
import { rewritePreviewForInternedFiles } from "../../fileProcessing";
import { Prisma } from "../../generated/client";
import { drawingS3Prefix, isS3Enabled, listS3Objects } from "../../s3";
import {
  getUserTrashCollectionId,
  isTrashCollectionId,
  LEGACY_TRASH_COLLECTION_ID,
  toPublicTrashCollectionId,
} from "./trash";
import type { DrawingRouteContext } from "./drawingRouteContext";

export const registerDrawingDeleteDuplicateRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    ensureTrashCollection,
    invalidateDrawingsCache,
    config,
    logAuditEvent,
    parseJsonField,
    cleanupS3FilesForDrawing,
    cloneS3FileReferences,
    revalidateDrawingAccess,
  } = context;
  app.delete(
    "/drawings/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;

      const userId = req.user.id;
      const requireTrashed = req.query.requireTrashed === "1";
      const preDeleteS3Keys = new Set<string>();
      if (isS3Enabled()) {
        try {
          const objects = await listS3Objects(drawingS3Prefix(userId, id));
          for (const obj of objects) preDeleteS3Keys.add(obj.key);
        } catch (error) {
          console.warn("[s3] Failed to list drawing files before delete", {
            drawingId: id,
            error,
          });
        }
      }
      const result = await prisma.$transaction(async (tx) => {
        const trashGuard = requireTrashed
          ? Prisma.sql`AND "collectionId" IN (${LEGACY_TRASH_COLLECTION_ID}, ${getUserTrashCollectionId(userId)})`
          : Prisma.empty;
        const [drawing] = await tx.$queryRaw<{ name: string }[]>`
          DELETE FROM "Drawing"
          WHERE "id" = ${id} AND "userId" = ${userId} ${trashGuard}
          RETURNING "name"`;
        if (drawing) {
          const s3Records = await tx.drawingFile.findMany({
            where: { drawingId: id, s3Key: { not: null } },
            select: { s3Key: true },
          });
          await tx.drawingFile.deleteMany({ where: { drawingId: id } });
          const s3Keys = new Set<string>(preDeleteS3Keys);
          for (const record of s3Records) {
            if (record.s3Key) s3Keys.add(record.s3Key);
          }
          return { drawing, s3Keys } as const;
        }
        const stillExists =
          requireTrashed &&
          (await tx.drawing.findFirst({
            where: { id, userId },
            select: { id: true },
          }));
        return { status: stillExists ? 409 : 404 } as const;
      });

      if ("status" in result) {
        if (result.status === 409) {
          return res.status(409).json({
            error: "Conflict",
            message: "Drawing is no longer in Trash",
          });
        }
        return res.status(404).json({ error: "Drawing not found" });
      }

      invalidateDrawingsCache();
      try {
        await revalidateDrawingAccess?.(id);
      } catch (error) {
        console.error("Failed to revalidate deleted drawing access:", error);
      }

      try {
        await cleanupS3FilesForDrawing(id, userId, result.s3Keys, {
          skipDbDelete: true,
        });
      } catch (error) {
        console.warn("[s3] Failed to cleanup deleted drawing files", {
          drawingId: id,
          error,
        });
      }

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: req.user.id,
          action: "drawing_deleted",
          resource: `drawing:${id}`,
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: { drawingId: id, drawingName: result.drawing.name },
        });
      }

      return res.json({ success: true });
    }),
  );

  app.post(
    "/drawings/:id/duplicate",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const original = await prisma.drawing.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!original)
        return res.status(404).json({ error: "Original drawing not found" });
      let duplicatedCollectionId = original.collectionId;
      if (isTrashCollectionId(original.collectionId, req.user.id)) {
        await ensureTrashCollection(prisma, req.user.id);
        duplicatedCollectionId = getUserTrashCollectionId(req.user.id);
      }

      const newDrawingId = uuidv4();
      const originalFiles = parseJsonField<Record<string, any>>(
        original.files,
        {},
      );
      const copiedS3Keys = new Set<string>();
      let newDrawing;
      try {
        const duplicatedFiles = await cloneS3FileReferences(
          original.id,
          newDrawingId,
          req.user.id,
          originalFiles,
          copiedS3Keys,
        );
        const duplicatedPreview = rewritePreviewForInternedFiles(
          original.preview ?? null,
          originalFiles,
          duplicatedFiles,
        );

        newDrawing = await prisma.drawing.create({
          data: {
            id: newDrawingId,
            name: `${original.name} (Copy)`,
            elements: original.elements,
            appState: original.appState,
            files: JSON.stringify(duplicatedFiles),
            preview:
              typeof duplicatedPreview === "string"
                ? duplicatedPreview
                : original.preview,
            userId: req.user.id,
            collectionId: duplicatedCollectionId,
            version: 1,
          },
        });
      } catch (error) {
        try {
          const published = await prisma.drawing.findUnique({
            where: { id: newDrawingId },
            select: { id: true },
          });
          if (!published) {
            await cleanupS3FilesForDrawing(
              newDrawingId,
              req.user.id,
              copiedS3Keys,
            );
          }
        } catch (cleanupError) {
          console.warn("[files] Failed to clean up duplicate drawing files", {
            drawingId: newDrawingId,
            error: cleanupError,
          });
        }
        throw error;
      }
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
};
