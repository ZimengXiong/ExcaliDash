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
import {
  isS3Enabled,
  generatePresignedDownloadUrl,
  uploadBuffer,
  buildS3Key,
} from "../s3";
import { MIME_TO_EXT } from "../fileProcessing";
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
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<T>
  ) => express.RequestHandler;
};

export const registerFileRoutes = (
  app: express.Express,
  deps: FileRouteDeps
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
    })
  );

  // ------------------------------------------------------------------
  // PUT /drawings/:drawingId/files/:fileId
  // Uploads the raw bytes of a single image. Idempotent: (drawingId,fileId)
  // is content-addressed, so an existing row with content is a 200 no-op.
  // ------------------------------------------------------------------
  app.put(
    "/drawings/:drawingId/files/:fileId",
    rawUpload,
    handleUploadPayloadError,
    requireAuth,
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
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({
          error: "Empty request body",
          message: "Send the raw image bytes as the request body.",
        });
      }

      const responseUrl = `/api/files/${drawingId}/${fileId}`;

      // Idempotent: an existing row that already carries content is a no-op.
      const existing = await prisma.drawingFile.findUnique({
        where: { drawingId_fileId: { drawingId, fileId } },
      });
      const hasContent =
        existing &&
        ((existing.storage === "s3" && Boolean(existing.s3Key)) ||
          (existing.storage === "db" && Boolean(existing.data)));
      if (hasContent) {
        return res.status(200).json({ url: responseUrl, fileId });
      }

      if (isS3Enabled()) {
        const ext = MIME_TO_EXT[mimeType] ?? "bin";
        const s3Key = buildS3Key(userId, drawingId, fileId, ext);
        await uploadBuffer(s3Key, body, mimeType);
        await prisma.drawingFile.upsert({
          where: { drawingId_fileId: { drawingId, fileId } },
          create: {
            drawingId,
            fileId,
            mimeType,
            sizeBytes: body.length,
            storage: "s3",
            s3Key,
            data: null,
          },
          update: {
            storage: "s3",
            s3Key,
            data: null,
            mimeType,
            sizeBytes: body.length,
          },
        });
        return res.status(200).json({ url: responseUrl, fileId });
      }

      // Database-bytes mode: persist the raw bytes inline.
      await prisma.drawingFile.upsert({
        where: { drawingId_fileId: { drawingId, fileId } },
        create: {
          drawingId,
          fileId,
          mimeType,
          sizeBytes: body.length,
          storage: "db",
          s3Key: null,
          data: body,
        },
        update: {
          storage: "db",
          s3Key: null,
          data: body,
          mimeType,
          sizeBytes: body.length,
        },
      });
      return res.status(200).json({ url: responseUrl, fileId });
    })
  );

  // ------------------------------------------------------------------
  // GET /files/:drawingId/:fileId
  // Serves the image. In db-mode the bytes are streamed directly with an
  // immutable cache policy and an ETag (honoring If-None-Match → 304). In
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

      const fileRecord = await prisma.drawingFile.findUnique({
        where: { drawingId_fileId: { drawingId, fileId } },
      });
      if (!fileRecord) {
        return res.status(404).json({ error: "File not found" });
      }

      if (fileRecord.storage === "db") {
        if (!fileRecord.data) {
          return res.status(404).json({ error: "File not found" });
        }
        // fileIds are content hashes, so the object is immutable — a strong
        // ETag equal to the fileId lets revisits short-circuit to 304.
        const etag = `"${fileId}"`;
        res.setHeader("ETag", etag);
        res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
        if (req.headers["if-none-match"] === etag) {
          return res.status(304).end();
        }
        const buffer = Buffer.isBuffer(fileRecord.data)
          ? fileRecord.data
          : Buffer.from(fileRecord.data as Uint8Array);
        res.setHeader("Content-Type", fileRecord.mimeType);
        res.setHeader("Content-Length", buffer.length);
        return res.status(200).end(buffer);
      }

      // storage === "s3": presigned redirect (private-bucket mode).
      if (!isS3Enabled() || !fileRecord.s3Key) {
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
