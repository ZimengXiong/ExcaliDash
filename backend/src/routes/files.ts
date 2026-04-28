/**
 * S3 file routes:
 *   GET  /files/config      – report whether S3 is configured (for frontend feature detection)
 *   GET  /files/:fileId     – redirect to a presigned S3 GET URL (private-bucket mode)
 */
import express from "express";
import { PrismaClient } from "../generated/client";
import {
  isS3Enabled,
  generatePresignedDownloadUrl,
} from "../s3";

const DOWNLOAD_EXPIRES_IN = 3600; // 1 hour   – cached by browser

/** Loose guard: fileId must be a safe, path-traversal-free identifier. */
const isValidFileId = (fileId: unknown): fileId is string =>
  typeof fileId === "string" && /^[\w-]{1,200}$/.test(fileId);

export type FileRouteDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<T>
  ) => express.RequestHandler;
};

export const registerFileRoutes = (
  app: express.Express,
  deps: FileRouteDeps
): void => {
  const { prisma, requireAuth, asyncHandler } = deps;

  // ------------------------------------------------------------------
  // GET /files/config
  // Returns whether S3 is enabled so the frontend can decide whether to
  // show storage management features.
  // ------------------------------------------------------------------
  app.get(
    "/files/config",
    requireAuth,
    asyncHandler(async (_req, res) => {
      return res.json({ s3Enabled: isS3Enabled() });
    })
  );

  // ------------------------------------------------------------------
  // GET /files/:fileId
  // Issues a presigned GET URL and redirects the browser to S3.
  // Used only in private-bucket deployments where S3_PUBLIC_URL is not
  // set and the dataURL stored in the drawing is "/api/files/:fileId".
  // ------------------------------------------------------------------
  app.get(
    "/files/:fileId",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!isS3Enabled()) {
        return res.status(501).json({ error: "S3 storage is not configured" });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { fileId } = req.params;
      if (!isValidFileId(fileId)) {
        return res.status(400).json({ error: "Invalid fileId" });
      }

      const fileRecord = await prisma.s3File.findUnique({
        where: { id: fileId },
      });

      if (!fileRecord) {
        return res.status(404).json({ error: "File not found" });
      }

      // Excalidraw fileIds are SHA-1 hashes of the file bytes — anyone
      // holding the original image can compute the id, so we cannot
      // treat the id as an unguessable capability. Authorise instead:
      //   - the uploader can always read; or
      //   - the caller has access to a drawing that references this id
      //     (own drawing OR one shared with the caller).
      if (fileRecord.userId !== userId) {
        const needle = `"${fileId}"`;
        const accessibleDrawing = await prisma.drawing.findFirst({
          where: {
            OR: [
              {
                userId,
                OR: [
                  { files: { contains: needle } },
                  { elements: { contains: needle } },
                ],
              },
              {
                permissions: { some: { granteeUserId: userId } },
                OR: [
                  { files: { contains: needle } },
                  { elements: { contains: needle } },
                ],
              },
            ],
          },
          select: { id: true },
        });
        if (!accessibleDrawing) {
          return res.status(404).json({ error: "File not found" });
        }
      }

      const downloadUrl = await generatePresignedDownloadUrl(
        fileRecord.s3Key,
        DOWNLOAD_EXPIRES_IN
      );

      return res.redirect(302, downloadUrl);
    })
  );
};
