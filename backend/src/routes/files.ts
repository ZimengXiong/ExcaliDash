/**
 * File routes:
 *   GET  /files/config                    – report whether S3 is configured
 *   PUT  /drawings/:drawingId/files/:fileId – upload raw image bytes (edit access)
 *   GET  /files/:drawingId/:fileId        – serve an image:
 *                                            db-mode → stream bytes (ETag/304)
 *                                            s3-mode → 302 to a presigned URL
 */
import express from "express";
import { PrismaClient } from "../generated/client";
import { isS3Enabled, generatePresignedDownloadUrl, buildS3Key } from "../s3";
import { MIME_TO_EXT, uploadDrawingFileToS3 } from "../fileProcessing";
import { randomUUID } from "node:crypto";
import { storedFileFilter, storeDrawingFileOnce } from "../drawingFileStore";
import { matchesIfNoneMatch } from "../server/ifNoneMatch";
import { config } from "../config";
import {
  canViewDrawing,
  canEditDrawing,
  getDrawingAccess,
} from "../authz/sharing";

const DOWNLOAD_EXPIRES_IN = 3600; // 1 hour   – cached by browser

/** Loose guard: drawingId / fileId must be safe, path-traversal-free identifiers. */
const isValidIdSegment = (value: unknown): value is string =>
  typeof value === "string" && /^[\w-]{1,200}$/.test(value);

export type FileRouteDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  optionalAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => Promise<T>,
  ) => express.RequestHandler;
};

export const registerFileRoutes = (
  app: express.Express,
  deps: FileRouteDeps,
): void => {
  const { prisma, requireAuth, optionalAuth, asyncHandler } = deps;

  // Raw body parser mounted ONLY on the upload route. The global
  // express.json parser ignores non-JSON content types, so the raw image
  // bytes reach here untouched. `FILE_UPLOAD_MAX_MB` is the single per-image
  // ceiling — it does not touch BODY_LIMIT_MB.
  const rawUpload = express.raw({
    type: "*/*",
    limit: config.fileUploadMaxBytes,
  });

  // Convert express.raw's PayloadTooLargeError into an actionable 413 JSON
  // response regardless of NODE_ENV (the global error handler would mask the
  // message in production).
  const handleUploadPayloadError: express.ErrorRequestHandler = (
    err,
    _req,
    res,
    next,
  ) => {
    if (
      err &&
      (err.type === "entity.too.large" ||
        err.status === 413 ||
        err.statusCode === 413)
    ) {
      res.status(413).json({
        error: "File too large",
        message: `Uploaded file exceeds the ${config.fileUploadMaxMb}MB limit. Raise FILE_UPLOAD_MAX_MB to accept larger images.`,
      });
      return;
    }
    next(err);
  };

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
    }),
  );

  // ------------------------------------------------------------------
  // PUT /drawings/:drawingId/files/:fileId
  // Uploads the raw bytes of a single image. Idempotent: (drawingId,fileId)
  // is content-addressed, so an existing row with content is a 200 no-op.
  // ------------------------------------------------------------------
  app.put(
    "/drawings/:drawingId/files/:fileId",
    // requireAuth runs BEFORE the raw-body parser so unauthenticated clients
    // can't impose the buffer cost of up to FILE_UPLOAD_MAX_MB per request.
    requireAuth,
    rawUpload,
    handleUploadPayloadError,
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { drawingId, fileId } = req.params;
      if (!isValidIdSegment(drawingId) || !isValidIdSegment(fileId)) {
        return res.status(400).json({ error: "Invalid id segment" });
      }

      const access = await getDrawingAccess({
        prisma,
        principal: { kind: "user", userId },
        drawingId,
      });
      if (!canEditDrawing(access)) {
        // 404 (not 403) so we don't leak the drawing's existence.
        return res.status(404).json({ error: "Drawing not found" });
      }

      const mimeType = (req.headers["content-type"] ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (!mimeType || !(mimeType in MIME_TO_EXT)) {
        return res.status(415).json({
          error: "Unsupported media type",
          message: `Content-Type must be one of: ${Object.keys(MIME_TO_EXT).join(", ")}`,
        });
      }

      const body = req.body;
      if (
        typeof body !== "object" ||
        body === null ||
        !Buffer.isBuffer(body) ||
        body.length === 0
      ) {
        return res.status(400).json({
          error: "Empty request body",
          message: "Send the raw image bytes as the request body.",
        });
      }

      const responseUrl = `/api/files/${drawingId}/${fileId}`;

      // Idempotent: an existing row that already carries content is a no-op.
      const existing = await prisma.drawingFile.findUnique({
        where: { drawingId_fileId: { drawingId, fileId }, ...storedFileFilter },
        select: { fileId: true },
      });
      if (existing) {
        return res.status(200).json({ url: responseUrl, fileId });
      }

      if (isS3Enabled()) {
        // Collaborators may upload, but storage listing and drawing cleanup
        // use the drawing owner's namespace, just like inline scene files.
        const drawing = await prisma.drawing.findUnique({
          where: { id: drawingId },
          select: { userId: true },
        });
        if (!drawing) {
          return res.status(404).json({ error: "Drawing not found" });
        }
        const ext = MIME_TO_EXT[mimeType] ?? "bin";
        const s3Key = buildS3Key(
          drawing.userId,
          drawingId,
          fileId,
          ext,
          randomUUID(),
        );
        await uploadDrawingFileToS3(
          prisma,
          { drawingId, fileId, mimeType, s3Key },
          body,
        );
        return res.status(200).json({ url: responseUrl, fileId });
      }

      // Database-bytes mode: persist the raw bytes inline.
      await storeDrawingFileOnce(prisma, {
        drawingId,
        fileId,
        mimeType,
        sizeBytes: body.length,
        storage: "db",
        s3Key: null,
        data: body,
      });
      return res.status(200).json({ url: responseUrl, fileId });
    }),
  );

  // ------------------------------------------------------------------
  // GET /files/:drawingId/:fileId
  // Serves the image. In db-mode the bytes are streamed directly with an
  // private cache policy and an ETag that revalidates drawing access. In
  // s3-mode a presigned GET URL is issued and the browser is redirected.
  // ------------------------------------------------------------------
  app.get(
    "/files/:drawingId/:fileId",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const { drawingId, fileId } = req.params;
      if (!isValidIdSegment(drawingId) || !isValidIdSegment(fileId)) {
        return res.status(400).json({ error: "Invalid id segment" });
      }

      // Drawing access decides authorization; fall back to 404 on
      // miss so we don't leak existence of a (drawing, fileId) pair.
      const access = await getDrawingAccess({
        prisma,
        principal: req.user?.id ? { kind: "user", userId: req.user.id } : null,
        drawingId,
      });
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "File not found" });
      }

      // File IDs are immutable. Decide whether a body could be needed before
      // selecting data, then publish the validator only for an existing DB file.
      const etag = `"${fileId}"`;
      const fresh = matchesIfNoneMatch(req.headers["if-none-match"], etag);
      const fileRecord = await prisma.drawingFile.findUnique({
        where: { drawingId_fileId: { drawingId, fileId }, ...storedFileFilter },
        select: { storage: true, s3Key: true, mimeType: true, data: !fresh },
      });
      if (!fileRecord) {
        return res.status(404).json({ error: "File not found" });
      }

      if (fileRecord.storage === "db") {
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "private, no-cache");
        if (fresh) {
          return res.status(304).end();
        }
        // Prisma materializes this column once. Node can write it directly.
        const buffer = fileRecord.data!;
        res.setHeader("Content-Type", fileRecord.mimeType);
        res.setHeader("Content-Length", buffer.length);
        return res.status(200).end(buffer);
      }

      // storage === "s3": presigned redirect (private-bucket mode).
      if (!isS3Enabled() || !fileRecord.s3Key) {
        return res.status(404).json({ error: "File not found" });
      }

      // The redirect bypasses the app's CSP/nosniff headers, so pin the
      // content type to the stored (whitelisted) value and force scriptable
      // types — SVG can carry <script> — to download instead of render.
      const isScriptableType =
        fileRecord.mimeType === "image/svg+xml" ||
        fileRecord.mimeType === "text/html";
      const downloadUrl = await generatePresignedDownloadUrl(
        fileRecord.s3Key,
        DOWNLOAD_EXPIRES_IN,
        {
          contentType: fileRecord.mimeType,
          contentDisposition: isScriptableType
            ? "attachment"
            : `inline; filename="${fileId}"`,
        },
      );

      return res.redirect(302, downloadUrl);
    }),
  );
};
