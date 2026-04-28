/**
 * S3 file routes:
 *   POST /files/upload-url  – issue a presigned S3 PUT URL for direct browser upload
 *   GET  /files/:fileId     – redirect to a presigned S3 GET URL (private-bucket mode)
 *   GET  /files/config      – report whether S3 is configured (for frontend feature detection)
 */
import express from "express";
import { PrismaClient } from "../generated/client";
import {
  isS3Enabled,
  getS3Config,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  getPublicUrl,
} from "../s3";

const FILE_KEY_PREFIX = process.env.S3_KEY_PREFIX?.replace(/\/+$/, "") || "excalidash";
const UPLOAD_EXPIRES_IN = 300;    // 5 minutes – enough for a browser PUT
const DOWNLOAD_EXPIRES_IN = 3600; // 1 hour   – cached by browser

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/svg+xml",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/png":     "png",
  "image/jpeg":    "jpg",
  "image/gif":     "gif",
  "image/webp":    "webp",
  "image/avif":    "avif",
  "image/bmp":     "bmp",
  "image/svg+xml": "svg",
};

/** Loose guard: fileId must be a safe, path-traversal-free identifier. */
const isValidFileId = (fileId: unknown): fileId is string =>
  typeof fileId === "string" && /^[\w-]{1,200}$/.test(fileId);

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
  // attempt a presigned upload or fall back to base64 storage.
  // ------------------------------------------------------------------
  app.get(
    "/files/config",
    requireAuth,
    asyncHandler(async (_req, res) => {
      return res.json({ s3Enabled: isS3Enabled() });
    })
  );

  // ------------------------------------------------------------------
  // POST /files/upload-url
  // Body: { fileId: string, mimeType: string, size?: number }
  // Returns: { uploadUrl: string, accessUrl: string }
  //   uploadUrl  – presigned S3 PUT URL; browser uploads directly here
  //   accessUrl  – where the image will be accessible after upload:
  //                  * full public URL  when S3_PUBLIC_URL is configured
  //                  * /api/files/:fileId for private-bucket deployments
  // ------------------------------------------------------------------
  app.post(
    "/files/upload-url",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!isS3Enabled()) {
        return res.status(501).json({ error: "S3 storage is not configured" });
      }

      const { fileId, drawingId, mimeType, size } = req.body as {
        fileId: unknown;
        drawingId: unknown;
        mimeType: unknown;
        size: unknown;
      };

      if (!isValidFileId(fileId)) {
        return res.status(400).json({ error: "Invalid fileId" });
      }

      if (typeof drawingId !== "string" || drawingId.length === 0) {
        return res.status(400).json({ error: "Invalid drawingId" });
      }

      if (typeof mimeType !== "string" || !ALLOWED_MIME_TYPES.has(mimeType)) {
        return res.status(400).json({ error: "Unsupported or missing mimeType" });
      }

      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
      if (typeof size === "number" && size > MAX_FILE_SIZE) {
        return res.status(400).json({ error: "File exceeds maximum allowed size (10 MB)" });
      }

      const userId = req.user!.id;
      const ext = MIME_TO_EXT[mimeType] ?? "bin";
      const s3Key = `${FILE_KEY_PREFIX}/${userId}/${drawingId}/${fileId}.${ext}`;

      const uploadUrl = await generatePresignedUploadUrl(
        s3Key,
        mimeType,
        UPLOAD_EXPIRES_IN
      );

      const cfg = getS3Config()!;
      // Determine how the browser will load the image after upload.
      const accessUrl = cfg.publicUrl
        ? getPublicUrl(s3Key)
        : `/api/files/${fileId}`;

      // Persist the file record so the GET /files/:fileId endpoint can
      // reconstruct the S3 key for private-bucket deployments.
      await prisma.s3File.upsert({
        where: { id: fileId },
        create: { id: fileId, userId, s3Key, mimeType },
        update: { s3Key, mimeType },
      });

      return res.json({ uploadUrl, accessUrl });
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
    optionalAuth,
    asyncHandler(async (req, res) => {
      if (!isS3Enabled()) {
        return res.status(501).json({ error: "S3 storage is not configured" });
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
      // treat the id as an unguessable capability. Authorise instead by
      // proving access to a drawing that references this id.
      const userId = req.user?.id ?? null;
      const needle = `"${fileId}"`;

      // Owner of the upload always has access.
      if (userId && fileRecord.userId === userId) {
        const downloadUrl = await generatePresignedDownloadUrl(
          fileRecord.s3Key,
          DOWNLOAD_EXPIRES_IN
        );
        return res.redirect(302, downloadUrl);
      }

      // Build the access predicate: a drawing referencing this fileId
      // that the caller is allowed to view.
      // - authenticated: own drawing, or one shared via DrawingPermission,
      //   or one with an active link-share (anyone with the link can view)
      // - anonymous: only drawings with an active link-share
      const referencesFile = {
        OR: [
          { files: { contains: needle } },
          { elements: { contains: needle } },
        ],
      } as const;

      const activeLinkShare = {
        linkShares: {
          some: {
            revokedAt: null,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        },
      } as const;

      const orClauses: any[] = [
        { ...referencesFile, ...activeLinkShare },
      ];
      if (userId) {
        orClauses.push({ ...referencesFile, userId });
        orClauses.push({
          ...referencesFile,
          permissions: { some: { granteeUserId: userId } },
        });
      }

      const accessibleDrawing = await prisma.drawing.findFirst({
        where: { OR: orClauses },
        select: { id: true },
      });
      if (!accessibleDrawing) {
        // 404 (not 401/403) so we don't leak existence to anyone who
        // happens to know a fileId.
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
