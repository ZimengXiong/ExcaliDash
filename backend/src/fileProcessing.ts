/**
 * Utility for scanning drawing file records and interning inline base64
 * dataURLs into the DrawingFile store. This is the single interception
 * point for image blobs arriving inside a scene save on the backend, and
 * it now runs in BOTH storage modes:
 *
 *   - S3 enabled:  bytes are uploaded to S3, DrawingFile row storage='s3'.
 *   - S3 disabled: bytes are stored in DrawingFile.data, storage='db'.
 *
 * In both modes the inline `data:` URL is rewritten to a drawing-scoped
 * ref (`/api/files/<drawingId>/<fileId>`, or the public S3 URL when
 * configured) before it reaches `Drawing.files`. Interning a stored
 * drawing's inline dataURLs is the lazy-migration path: loads still work
 * because the shipped client rehydrates `/api/files/` refs.
 */
import type { PrismaClient } from "./generated/client";
import {
  isS3Enabled,
  getS3Config,
  uploadBuffer,
  getPublicUrl,
  buildS3Key,
} from "./s3";

/**
 * Reject anything that could escape the per-user/per-drawing S3 prefix.
 * Same shape used by `/files/:drawingId/:fileId` validation.
 */
const VALID_FILE_ID = /^[\w-]{1,200}$/;

export const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

/**
 * Decode a base64 data URL into a Buffer and its MIME type.
 * Returns null if the string is not a valid data URL.
 */
export const decodeDataURL = (
  dataURL: string,
): { buffer: Buffer; mimeType: string } | null => {
  const match = dataURL.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;

  const mimeType = match[1];
  const base64 = match[2];

  try {
    const buffer = Buffer.from(base64, "base64");
    return { buffer, mimeType };
  } catch {
    return null;
  }
};

/**
 * Scan a drawing's files record for base64 dataURLs, store them in the
 * DrawingFile store (S3 or db bytes depending on config), and replace the
 * dataURL with the drawing-scoped access URL.
 *
 * Entries whose dataURL is already a ref (https://, /api/files/, ...) are
 * left untouched, so this is safe to run on every scene save.
 */
export const internDrawingFiles = async (
  files: Record<string, any>,
  userId: string,
  drawingId: string,
  prisma: Pick<PrismaClient, "drawingFile">,
): Promise<Record<string, any>> => {
  const s3Enabled = isS3Enabled();
  const cfg = s3Enabled ? getS3Config() : null;
  const result: Record<string, any> = { ...files };

  // Bound parallel writes. Without this, a paste of N images fires N
  // parallel uploads, which can spike S3 connection pools (or open a burst
  // of DB writes) and produce inconsistent partial-failure states on shaky
  // networks.
  const UPLOAD_CONCURRENCY = 8;

  const processFile = async ([fileId, file]: [string, any]): Promise<void> => {
    if (!VALID_FILE_ID.test(fileId)) {
      // Reject path-traversal candidates rather than silently storing them
      // under a forged key. Drop from output so the bad entry never reaches
      // the database either.
      console.warn(`[files] Skipping file with invalid id: ${JSON.stringify(fileId)}`);
      delete result[fileId];
      return;
    }

    const dataURL: unknown = file?.dataURL;
    if (typeof dataURL !== "string" || !dataURL.startsWith("data:")) {
      // Not a base64 data URL — leave unchanged (https://, /api/files/, etc.)
      return;
    }

    const decoded = decodeDataURL(dataURL);
    if (!decoded) return;

    const sizeBytes = decoded.buffer.length;

    if (s3Enabled) {
      const ext = MIME_TO_EXT[decoded.mimeType] ?? "bin";
      const s3Key = buildS3Key(userId, drawingId, fileId, ext);

      await uploadBuffer(s3Key, decoded.buffer, decoded.mimeType);

      // Drawing-scoped access URL: a file id alone would be ambiguous
      // because the same content hash legitimately repeats across drawings.
      const accessUrl = cfg?.publicUrl
        ? getPublicUrl(s3Key)
        : `/api/files/${drawingId}/${fileId}`;

      await prisma.drawingFile.upsert({
        where: { drawingId_fileId: { drawingId, fileId } },
        create: {
          drawingId,
          fileId,
          mimeType: decoded.mimeType,
          sizeBytes,
          storage: "s3",
          s3Key,
          data: null,
        },
        update: { storage: "s3", s3Key, data: null, mimeType: decoded.mimeType, sizeBytes },
      });

      result[fileId] = { ...file, dataURL: accessUrl };
      return;
    }

    // Database-bytes mode: store the raw bytes inline in DrawingFile.data.
    await prisma.drawingFile.upsert({
      where: { drawingId_fileId: { drawingId, fileId } },
      create: {
        drawingId,
        fileId,
        mimeType: decoded.mimeType,
        sizeBytes,
        storage: "db",
        s3Key: null,
        data: decoded.buffer,
      },
      update: {
        storage: "db",
        s3Key: null,
        data: decoded.buffer,
        mimeType: decoded.mimeType,
        sizeBytes,
      },
    });

    result[fileId] = { ...file, dataURL: `/api/files/${drawingId}/${fileId}` };
  };

  const entries = Object.entries(files);
  for (let i = 0; i < entries.length; i += UPLOAD_CONCURRENCY) {
    await Promise.all(
      entries.slice(i, i + UPLOAD_CONCURRENCY).map(processFile),
    );
  }

  return result;
};

/**
 * Rewrite an Excalidraw preview SVG so any base64 dataURL that has just
 * been interned is replaced by the resulting access / ref URL.
 *
 * The frontend generates the preview SVG from the canvas state at save
 * time, *before* the round-trip to the backend interns the files; the
 * SVG embeds whatever dataURL the file currently has in `Drawing.files`.
 * Without this rewrite, every save produces a megabyte-scale preview
 * with the full image base64 inlined, even though the image itself is
 * already stored (the diff between Drawing.files's processed entries
 * and the preview field gets ever larger over time).
 *
 * Best-effort string substitution: works because the same dataURL
 * string is character-identical in both `files[fileId].dataURL` and
 * the preview SVG's `<image href="...">` attribute. If frontend
 * encoding ever diverges, the worst case is the preview is left as-is.
 */
export const rewritePreviewForInternedFiles = (
  preview: unknown,
  originalFiles: Record<string, any>,
  processedFiles: Record<string, any>,
): unknown => {
  if (typeof preview !== "string" || preview.length === 0) {
    return preview;
  }
  let rewritten = preview;
  for (const fileId of Object.keys(processedFiles)) {
    const original = originalFiles[fileId];
    const processed = processedFiles[fileId];
    if (
      !original ||
      !processed ||
      typeof original.dataURL !== "string" ||
      typeof processed.dataURL !== "string" ||
      original.dataURL === processed.dataURL ||
      !original.dataURL.startsWith("data:")
    ) {
      continue;
    }
    rewritten = rewritten.split(original.dataURL).join(processed.dataURL);
  }
  return rewritten;
};
