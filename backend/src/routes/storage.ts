/**
 * Storage management routes:
 *   POST   /drawings/:id/trim          – trim deleted elements and orphaned files
 *   GET    /drawings/:id/files/diff    – three-way file comparison
 *   DELETE /drawings/:id/files/orphans – delete selected orphaned files
 */
import express from "express";
import type { Server as SocketIoServer } from "socket.io";
import { PrismaClient } from "../generated/client";
import {
  isS3Enabled,
  deleteS3Object,
  listS3Objects,
  drawingS3Prefix,
} from "../s3";
import {
  VALID_STORAGE_FILE_ID,
  type StoredFileRecord,
  type S3ObjectRecord,
} from "./storage/helpers";
import {
  buildFilesDiffResponse,
  buildOrphanDeletePlan,
  buildTrimPlan,
  buildTrimS3CleanupPlan,
} from "./storage/plans";
import { deleteS3KeysInBatches } from "./storage/s3Delete";

export type StorageRouteDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => Promise<T>,
  ) => express.RequestHandler;
  parseJsonField: <T>(rawValue: string | null | undefined, fallback: T) => T;
  invalidateDrawingsCache: () => void;
  io: SocketIoServer;
};

export const registerStorageRoutes = (
  app: express.Express,
  deps: StorageRouteDeps,
): void => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    parseJsonField,
    invalidateDrawingsCache,
    io,
  } = deps;

  /**
   * Tell anyone joined to the drawing's collaboration room that the
   * server-side state has changed underneath them. The frontend reacts
   * by reloading the drawing — otherwise a collaborator's next save
   * would re-introduce the trimmed-away elements.
   */
  const notifyServerStateChange = (drawingId: string) => {
    io.to(`drawing_${drawingId}`).emit("drawing-server-update", { drawingId });
  };

  // ------------------------------------------------------------------
  // POST /drawings/:id/trim
  // ------------------------------------------------------------------
  app.post(
    "/drawings/:id/trim",
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const { confirmName } = req.body ?? {};

      // 1. Find drawing owned by user
      const drawing = await prisma.drawing.findFirst({
        where: { id, userId },
      });
      if (!drawing) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      // Confirm name must match
      if (typeof confirmName !== "string" || confirmName !== drawing.name) {
        return res
          .status(403)
          .json({ error: "confirmName does not match drawing name" });
      }

      const elements: any[] = parseJsonField(drawing.elements, []);
      const files: Record<string, any> = parseJsonField(drawing.files, {});
      const trimPlan = buildTrimPlan(elements, files);

      // Commit the trimmed drawing FIRST, guarded on the version we read.
      // If a concurrent editor saved in between, `count` is 0 — we abort
      // with 409 instead of overwriting their newer state with our stale
      // snapshot, and we have not yet touched S3, so nothing is stranded.
      const updateResult = await prisma.drawing.updateMany({
        where: { id, version: drawing.version },
        data: {
          elements: JSON.stringify(trimPlan.activeElements),
          files: JSON.stringify(trimPlan.cleanedFiles),
          version: { increment: 1 },
        },
      });
      if (updateResult.count === 0) {
        return res.status(409).json({
          error: "Conflict",
          code: "VERSION_CONFLICT",
          message: "Drawing has changed since it was loaded for trimming.",
        });
      }

      // S3File is keyed (drawingId, fileId) and S3 objects sit under a
      // per-drawing path, so this drawing's storage is independent from
      // every other drawing's — no cross-drawing reference check needed.
      // Duplicates are made by copying objects into the new drawingId
      // path (see drawings.ts /duplicate), so deleting the original
      // does not strand a sibling.
      //
      // Delete objects only AFTER the DB write succeeds: the committed row
      // no longer references the orphan files, so a mid-cleanup crash just
      // leaves recoverable orphan S3 objects rather than a live drawing
      // pointing at deleted objects (broken images).
      let s3ObjectsDeleted = 0;
      let s3DeleteErrors = 0;

      // DrawingFile rows exist in both storage modes; orphan rows are
      // reclaimed in both, and S3 objects are additionally deleted when S3
      // is enabled.
      const storedRecords = await prisma.drawingFile.findMany({
        where: { drawingId: id },
        select: {
          fileId: true,
          storage: true,
          s3Key: true,
          mimeType: true,
          sizeBytes: true,
        },
      });
      const s3Objects = isS3Enabled()
        ? await listS3Objects(drawingS3Prefix(userId, id))
        : [];

      const s3CleanupPlan = buildTrimS3CleanupPlan({
        survivingFileIds: trimPlan.survivingFileIds,
        storedRecords,
        s3Objects,
      });

      if (isS3Enabled() && s3CleanupPlan.orphanKeys.length > 0) {
        const deleteResult = await deleteS3KeysInBatches({
          keys: s3CleanupPlan.orphanKeys,
          logPrefix: "[storage/trim]",
          deleteObject: deleteS3Object,
        });
        s3ObjectsDeleted = deleteResult.deleted;
        s3DeleteErrors = deleteResult.errors;
      }

      if (s3CleanupPlan.orphanFileIds.length > 0) {
        await prisma.drawingFile.deleteMany({
          where: {
            drawingId: id,
            fileId: { in: s3CleanupPlan.orphanFileIds },
          },
        });
      }

      invalidateDrawingsCache();
      notifyServerStateChange(id);

      return res.json({
        trimmed: {
          elementsRemoved: trimPlan.elementsRemoved,
          filesRemoved: trimPlan.filesRemoved,
          s3ObjectsDeleted,
          s3DeleteErrors,
        },
      });
    }),
  );

  // ------------------------------------------------------------------
  // GET /drawings/:id/files/diff
  // ------------------------------------------------------------------
  app.get(
    "/drawings/:id/files/diff",
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;

      const drawing = await prisma.drawing.findFirst({
        where: { id, userId },
      });
      if (!drawing) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const elements: any[] = parseJsonField(drawing.elements, []);
      const files: Record<string, any> = parseJsonField(drawing.files, {});
      const storedRecords: StoredFileRecord[] = await prisma.drawingFile.findMany({
        where: { drawingId: id },
        select: {
          fileId: true,
          storage: true,
          s3Key: true,
          mimeType: true,
          sizeBytes: true,
        },
      });
      const s3Objects: S3ObjectRecord[] = isS3Enabled()
        ? await listS3Objects(drawingS3Prefix(userId, id))
        : [];

      const diffResponse = buildFilesDiffResponse({
        elements,
        files,
        storedRecords,
        s3Objects,
      });

      return res.json(diffResponse);
    }),
  );

  // ------------------------------------------------------------------
  // DELETE /drawings/:id/files/orphans
  // ------------------------------------------------------------------
  app.delete(
    "/drawings/:id/files/orphans",
    requireAuth,
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      const { confirmName, fileIds: rawFileIds } = req.body ?? {};

      if (!Array.isArray(rawFileIds) || rawFileIds.length === 0) {
        return res
          .status(400)
          .json({ error: "fileIds must be a non-empty array" });
      }

      // Validate every entry: same regex as the rest of the codebase
      // (security.ts sanitiser, /files/:fileId route, processFilesForS3).
      // Without this, a non-string or path-traversal-shaped id would
      // explode inside the Prisma / S3 calls below.
      const invalidIds = rawFileIds.filter(
        (fid) => typeof fid !== "string" || !VALID_STORAGE_FILE_ID.test(fid),
      );
      if (invalidIds.length > 0) {
        return res.status(400).json({
          error: "fileIds contains invalid entries",
          invalidFileIds: invalidIds,
        });
      }
      const fileIds = rawFileIds as string[];

      const drawing = await prisma.drawing.findFirst({
        where: { id, userId },
      });
      if (!drawing) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      if (typeof confirmName !== "string" || confirmName !== drawing.name) {
        return res
          .status(403)
          .json({ error: "confirmName does not match drawing name" });
      }

      const elements: any[] = parseJsonField(drawing.elements, []);
      const files: Record<string, any> = parseJsonField(drawing.files, {});
      const deletePlan = buildOrphanDeletePlan({ elements, files, fileIds });

      if (deletePlan.blockedIds.length > 0) {
        return res.status(400).json({
          error: "Cannot delete files referenced by active elements",
          blockedFileIds: deletePlan.blockedIds,
        });
      }

      // Commit the cleaned drawing FIRST, guarded on the version we read.
      // A concurrent editor that re-referenced one of these files (or saved
      // anything else) bumps the version, so `count` is 0 and we abort with
      // 409 instead of deleting files the live drawing now depends on. S3 is
      // untouched at this point, so a conflict strands nothing.
      const updateResult = await prisma.drawing.updateMany({
        where: { id, version: drawing.version },
        data: {
          files: JSON.stringify(deletePlan.cleanedFiles),
          elements: JSON.stringify(deletePlan.cleanedElements),
          version: { increment: 1 },
        },
      });
      if (updateResult.count === 0) {
        return res.status(409).json({
          error: "Conflict",
          code: "VERSION_CONFLICT",
          message: "Drawing has changed since it was loaded for cleanup.",
        });
      }

      // Batched S3 + DB cleanup, run only AFTER the DB write commits. S3File
      // rows are scoped (drawingId, fileId), and each drawing has its own S3
      // object under its own prefix path — deletion here cannot strand a
      // sibling drawing. Doing N+1 sequential lookups + deletes per file
      // would tie up the request unnecessarily for large selections.
      let s3DeleteErrors = 0;

      if (isS3Enabled()) {
        const s3Records = await prisma.drawingFile.findMany({
          where: { drawingId: id, fileId: { in: fileIds }, storage: "s3" },
          select: { s3Key: true },
        });
        const deleteResult = await deleteS3KeysInBatches({
          keys: s3Records
            .map((record) => record.s3Key)
            .filter((key): key is string => Boolean(key)),
          logPrefix: "[storage/orphans]",
          deleteObject: deleteS3Object,
        });
        s3DeleteErrors = deleteResult.errors;
      }

      // Reclaim the DrawingFile rows in both modes (db-mode bytes live here).
      await prisma.drawingFile.deleteMany({
        where: { drawingId: id, fileId: { in: fileIds } },
      });

      const errorCount = s3DeleteErrors;

      invalidateDrawingsCache();
      notifyServerStateChange(id);

      return res.json({ deleted: deletePlan.deletedCount, errors: errorCount });
    }),
  );
};
