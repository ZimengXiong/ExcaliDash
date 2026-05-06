/**
 * Utility for scanning drawing file records and uploading base64 dataURLs to S3.
 * This is the single interception point for all image uploads on the backend.
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

const MIME_TO_EXT: Record<string, string> = {
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
 * Scan a drawing's files record for base64 dataURLs, upload them to S3,
 * and replace the dataURL with the S3 access URL.
 *
 * When S3 is disabled the files record is returned unchanged.
 */
export const processFilesForS3 = async (
  files: Record<string, any>,
  userId: string,
  drawingId: string,
  prisma: Pick<PrismaClient, "s3File">,
): Promise<Record<string, any>> => {
  if (!isS3Enabled()) {
    return files;
  }

  const cfg = getS3Config()!;
  const result: Record<string, any> = { ...files };

  const uploadTasks = Object.entries(files).map(async ([fileId, file]) => {
    if (!VALID_FILE_ID.test(fileId)) {
      // Reject path-traversal candidates rather than silently uploading
      // them under a forged S3 key. Drop from output so the bad entry
      // never reaches the database either.
      console.warn(`[s3] Skipping file with invalid id: ${JSON.stringify(fileId)}`);
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

    const ext = MIME_TO_EXT[decoded.mimeType] ?? "bin";
    const s3Key = buildS3Key(userId, drawingId, fileId, ext);

    await uploadBuffer(s3Key, decoded.buffer, decoded.mimeType);

    // Drawing-scoped access URL: a file id alone would be ambiguous
    // because the same content hash legitimately repeats across drawings.
    const accessUrl = cfg.publicUrl
      ? getPublicUrl(s3Key)
      : `/api/files/${drawingId}/${fileId}`;

    // Persist the S3File record so private-bucket deployments can serve it.
    // Composite (drawingId, fileId) PK so re-uploading the same image into
    // another drawing creates a separate row instead of overwriting.
    await prisma.s3File.upsert({
      where: { drawingId_fileId: { drawingId, fileId } },
      create: { drawingId, fileId, userId, s3Key, mimeType: decoded.mimeType },
      update: { s3Key, mimeType: decoded.mimeType },
    });

    result[fileId] = { ...file, dataURL: accessUrl };
  });

  await Promise.all(uploadTasks);

  return result;
};

/**
 * Rewrite an Excalidraw preview SVG so any base64 dataURL that has just
 * been uploaded to S3 is replaced by the resulting S3 / redirect URL.
 *
 * The frontend generates the preview SVG from the canvas state at save
 * time, *before* the round-trip to the backend uploads the files; the
 * SVG embeds whatever dataURL the file currently has in `Drawing.files`.
 * Without this rewrite, every save produces a megabyte-scale preview
 * with the full image base64 inlined, even though the image itself is
 * already in S3 (the diff between Drawing.files's processed entries
 * and the preview field gets ever larger over time).
 *
 * Best-effort string substitution: works because the same dataURL
 * string is character-identical in both `files[fileId].dataURL` and
 * the preview SVG's `<image href="...">` attribute. If frontend
 * encoding ever diverges, the worst case is the preview is left as-is.
 */
export const rewritePreviewForS3 = (
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
