/**
 * Storage management routes:
 *   POST   /drawings/:id/trim          – trim deleted elements and orphaned files
 *   GET    /drawings/:id/files/diff    – three-way file comparison
 *   DELETE /drawings/:id/files/orphans – delete selected orphaned files
 */
import express from "express";
import { PrismaClient } from "../generated/client";
import { isS3Enabled, deleteS3Object, listS3Objects } from "../s3";

const FILE_KEY_PREFIX =
  process.env.S3_KEY_PREFIX?.replace(/\/+$/, "") || "excalidash";

export type StorageRouteDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => Promise<T>
  ) => express.RequestHandler;
  parseJsonField: <T>(rawValue: string | null | undefined, fallback: T) => T;
};

/**
 * Collect fileIds referenced by image elements.
 * When includeDeleted is false, elements with isDeleted: true are skipped.
 */
const collectReferencedFileIds = (
  elements: any[],
  includeDeleted: boolean
): Set<string> => {
  const ids = new Set<string>();
  for (const el of elements) {
    if (!includeDeleted && el.isDeleted) continue;
    if (el.type === "image" && typeof el.fileId === "string" && el.fileId) {
      ids.add(el.fileId);
    }
  }
  return ids;
};

/**
 * Extract the fileId from an S3 key. The key format is:
 *   {prefix}/{userId}/{drawingId}/{fileId}.{ext}
 * Returns the fileId (without extension), or null if the key doesn't match.
 */
const fileIdFromS3Key = (key: string): string | null => {
  const lastSegment = key.split("/").pop();
  if (!lastSegment) return null;
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex <= 0) return lastSegment; // no extension
  return lastSegment.substring(0, dotIndex);
};

export const registerStorageRoutes = (
  app: express.Express,
  deps: StorageRouteDeps
): void => {
  const { prisma, requireAuth, asyncHandler, parseJsonField } = deps;

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

      // 2. Parse elements and files
      const elements: any[] = parseJsonField(drawing.elements, []);
      const files: Record<string, any> = parseJsonField(drawing.files, {});

      // 3. Filter elements: keep only non-deleted
      const activeElements = elements.filter((el) => !el.isDeleted);
      const elementsRemoved = elements.length - activeElements.length;

      // 4. Collect surviving fileIds
      const survivingFileIds = collectReferencedFileIds(activeElements, false);

      // 5. Filter files
      const originalFileCount = Object.keys(files).length;
      const cleanedFiles: Record<string, any> = {};
      for (const [fileId, value] of Object.entries(files)) {
        if (survivingFileIds.has(fileId)) {
          cleanedFiles[fileId] = value;
        }
      }
      const filesRemoved = originalFileCount - Object.keys(cleanedFiles).length;

      // 6. S3 cleanup
      let s3ObjectsDeleted = 0;
      let s3DeleteErrors = 0;

      if (isS3Enabled()) {
        const s3Prefix = `${FILE_KEY_PREFIX}/${userId}/${id}/`;

        // Query S3File records for this drawing
        const s3FileRecords = await prisma.s3File.findMany({
          where: { s3Key: { startsWith: s3Prefix } },
        });

        // List actual S3 objects
        const s3Objects = await listS3Objects(s3Prefix);

        // Collect all keys to potentially delete (union of records and actual objects)
        const orphanedKeys = new Set<string>();

        for (const record of s3FileRecords) {
          const fileId = record.id;
          if (!survivingFileIds.has(fileId)) {
            orphanedKeys.add(record.s3Key);
          }
        }

        for (const obj of s3Objects) {
          const fileId = fileIdFromS3Key(obj.key);
          if (fileId && !survivingFileIds.has(fileId)) {
            orphanedKeys.add(obj.key);
          }
        }

        // Delete orphaned S3 objects and records
        for (const key of orphanedKeys) {
          try {
            await deleteS3Object(key);
            s3ObjectsDeleted++;
          } catch (err) {
            console.error(`[storage/trim] Failed to delete S3 object: ${key}`, err);
            s3DeleteErrors++;
          }
        }

        // Delete orphaned S3File records
        const orphanedRecordIds = s3FileRecords
          .filter((r) => !survivingFileIds.has(r.id))
          .map((r) => r.id);

        if (orphanedRecordIds.length > 0) {
          await prisma.s3File.deleteMany({
            where: { id: { in: orphanedRecordIds } },
          });
        }
      }

      // 7. Update drawing
      await prisma.drawing.update({
        where: { id },
        data: {
          elements: JSON.stringify(activeElements),
          files: JSON.stringify(cleanedFiles),
          version: 1,
        },
      });

      return res.json({
        trimmed: {
          elementsRemoved,
          filesRemoved,
          s3ObjectsDeleted,
          s3DeleteErrors,
        },
      });
    })
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

      // Canvas refs (all elements including deleted)
      const allCanvasRefs = collectReferencedFileIds(elements, true);
      // Active canvas refs (non-deleted only)
      const activeCanvasRefs = collectReferencedFileIds(elements, false);

      // SQLite file keys
      const sqliteFileIds = new Set(Object.keys(files));

      // S3File records and actual S3 objects
      const s3Prefix = `${FILE_KEY_PREFIX}/${userId}/${id}/`;
      let s3FileRecords: Array<{
        id: string;
        s3Key: string;
        mimeType: string;
      }> = [];
      let s3Objects: Array<{ key: string; size: number }> = [];

      if (isS3Enabled()) {
        s3FileRecords = await prisma.s3File.findMany({
          where: { s3Key: { startsWith: s3Prefix } },
          select: { id: true, s3Key: true, mimeType: true },
        });
        s3Objects = await listS3Objects(s3Prefix);
      }

      const s3RecordMap = new Map(
        s3FileRecords.map((r) => [r.id, r])
      );
      const s3ObjectMap = new Map(
        s3Objects.map((o) => {
          const fid = fileIdFromS3Key(o.key);
          return [fid, o] as const;
        })
      );

      // Build union of all fileIds
      const allFileIds = new Set<string>();
      for (const fid of allCanvasRefs) allFileIds.add(fid);
      for (const fid of sqliteFileIds) allFileIds.add(fid);
      for (const r of s3FileRecords) allFileIds.add(r.id);
      for (const o of s3Objects) {
        const fid = fileIdFromS3Key(o.key);
        if (fid) allFileIds.add(fid);
      }

      const filesList = Array.from(allFileIds).map((fileId) => {
        const s3Record = s3RecordMap.get(fileId);
        const s3Obj = s3ObjectMap.get(fileId);

        return {
          fileId,
          inCanvas: allCanvasRefs.has(fileId),
          inCanvasActive: activeCanvasRefs.has(fileId),
          inSqlite: sqliteFileIds.has(fileId),
          inS3: !!s3Obj,
          inS3Record: !!s3Record,
          s3Key: s3Record?.s3Key ?? s3Obj?.key ?? null,
          mimeType: s3Record?.mimeType ?? null,
          s3SizeBytes: s3Obj?.size ?? null,
        };
      });

      return res.json({
        summary: {
          totalCanvasRefs: allCanvasRefs.size,
          totalSqliteFiles: sqliteFileIds.size,
          totalS3Files: s3Objects.length,
        },
        files: filesList,
      });
    })
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
      const { confirmName, fileIds } = req.body ?? {};

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ error: "fileIds must be a non-empty array" });
      }

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

      // Safety: reject if any fileId is still referenced by a non-deleted element
      const activeRefs = collectReferencedFileIds(elements, false);
      const blockedIds = (fileIds as string[]).filter((fid) =>
        activeRefs.has(fid)
      );
      if (blockedIds.length > 0) {
        return res.status(400).json({
          error: "Cannot delete files referenced by active elements",
          blockedFileIds: blockedIds,
        });
      }

      let deletedCount = 0;
      let errorCount = 0;

      for (const fileId of fileIds as string[]) {
        try {
          // Delete S3 object via S3File record
          if (isS3Enabled()) {
            const s3Record = await prisma.s3File.findUnique({
              where: { id: fileId },
            });
            if (s3Record) {
              await deleteS3Object(s3Record.s3Key);
              await prisma.s3File.delete({ where: { id: fileId } });
            }
          }

          // Remove from drawing.files JSON
          delete files[fileId];

          deletedCount++;
        } catch (err: any) {
          console.error(
            `[storage/orphans] Failed to delete fileId=${fileId}`,
            err
          );
          errorCount++;
        }
      }

      // Also remove deleted elements that reference the orphaned files,
      // so the files disappear from the diff completely.
      const deletedFileIdSet = new Set(fileIds as string[]);
      const cleanedElements = elements.filter((el: any) => {
        if (
          el.isDeleted &&
          el.type === "image" &&
          typeof el.fileId === "string" &&
          deletedFileIdSet.has(el.fileId)
        ) {
          return false; // remove this deleted element
        }
        return true;
      });

      // Update drawing with cleaned files and elements
      await prisma.drawing.update({
        where: { id },
        data: {
          files: JSON.stringify(files),
          elements: JSON.stringify(cleanedElements),
        },
      });

      return res.json({ deleted: deletedCount, errors: errorCount });
    })
  );
};
