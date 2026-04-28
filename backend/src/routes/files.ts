/**
 * S3 file routes:
 *   GET  /files/config                  – report whether S3 is configured
 *   GET  /files/:drawingId/:fileId      – redirect to a presigned S3 GET URL
 *                                          (private-bucket mode)
 */
import express from "express";
import { PrismaClient } from "../generated/client";
import {
  isS3Enabled,
  generatePresignedDownloadUrl,
} from "../s3";

const DOWNLOAD_EXPIRES_IN = 3600; // 1 hour   – cached by browser

/** Loose guard: drawingId / fileId must be safe, path-traversal-free identifiers. */
const isValidIdSegment = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,200}$/.test(value);

export type FileRouteDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  optionalAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<T>
  ) => express.RequestHandler;
};

export const registerFileRoutes = (
  app: express.Express,
  deps: FileRouteDeps
): void => {
  const { prisma, requireAuth, optionalAuth, asyncHandler } = deps;

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
    "/files/:drawingId/:fileId",
    optionalAuth,
    asyncHandler(async (req, res) => {
      if (!isS3Enabled()) {
        return res.status(501).json({ error: "S3 storage is not configured" });
      }

      const { drawingId, fileId } = req.params;
      if (!isValidIdSegment(drawingId) || !isValidIdSegment(fileId)) {
        return res.status(400).json({ error: "Invalid id segment" });
      }

      // Drawing access decides authorisation; fall back to 404 on
      // miss so we don't leak existence of a (drawing, fileId) pair.
      const drawing = await prisma.drawing.findUnique({
        where: { id: drawingId },
        select: {
          id: true,
          userId: true,
          permissions: { select: { granteeUserId: true } },
          linkShares: {
            where: {
              revokedAt: null,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
              ],
            },
            select: { id: true },
          },
        },
      });
      if (!drawing) {
        return res.status(404).json({ error: "File not found" });
      }

      const callerUserId = req.user?.id ?? null;
      const isOwner = callerUserId !== null && drawing.userId === callerUserId;
      const isExplicitGrantee =
        callerUserId !== null &&
        drawing.permissions.some((p) => p.granteeUserId === callerUserId);
      const hasActiveLinkShare = drawing.linkShares.length > 0;

      if (!isOwner && !isExplicitGrantee && !hasActiveLinkShare) {
        return res.status(404).json({ error: "File not found" });
      }

      const fileRecord = await prisma.s3File.findUnique({
        where: { drawingId_fileId: { drawingId, fileId } },
      });
      if (!fileRecord) {
        return res.status(404).json({ error: "File not found" });
      }

      const downloadUrl = await generatePresignedDownloadUrl(
        fileRecord.s3Key,
        DOWNLOAD_EXPIRES_IN
      );

      return res.redirect(302, downloadUrl);
    })
  );
};
