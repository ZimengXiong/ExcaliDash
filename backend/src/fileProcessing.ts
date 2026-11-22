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
import { randomUUID } from "node:crypto";
import {
  storedFileFilter,
  storeDrawingFileOnce,
  type StoredFileMetadata,
} from "./drawingFileStore";
import {
  isS3Enabled,
  getS3Config,
  uploadBuffer,
  getPublicUrl,
  buildS3Key,
  deleteS3Object,
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

const base64Header = /^data:([^;]+);base64,/;

/**
 * Decode a base64 data URL into a Buffer and its MIME type.
 * Returns null if the string is not a valid data URL.
 */
export const decodeDataURL = (
  dataURL: string,
): { buffer: Buffer; mimeType: string } | null => {
  const match = dataURL.match(base64Header);
  if (!match) return null;

  const mimeType = match[1];
  const base64 = dataURL.slice(match[0].length);

  try {
    const buffer = Buffer.from(base64, "base64");
    return buffer.length > 0 ? { buffer, mimeType } : null;
  } catch {
    return null;
  }
};

/** Reclaim only this request's fresh generation when another row won. */
const cleanupUnusedS3Upload = async (
  freshKey: string,
  stored: Pick<StoredFileMetadata, "storage" | "s3Key"> | null,
): Promise<void> => {
  if (stored?.storage === "s3" && stored.s3Key === freshKey) return;
  try {
    await deleteS3Object(freshKey);
  } catch (error) {
    // The winning upload remains valid even if compensation is unavailable.
    console.warn("[files] Failed to cleanup unused S3 upload", {
      freshKey,
      error,
    });
  }
};

export const uploadDrawingFileToS3 = async (
  prisma: Pick<PrismaClient, "$queryRaw" | "drawingFile">,
  file: { drawingId: string; fileId: string; mimeType: string; s3Key: string },
  buffer: Buffer,
): Promise<StoredFileMetadata> => {
  const { drawingId, fileId, s3Key, mimeType } = file;
  let stored: StoredFileMetadata;
  try {
    await uploadBuffer(s3Key, buffer, mimeType);
    stored = await storeDrawingFileOnce(prisma, {
      ...file,
      sizeBytes: buffer.length,
      storage: "s3",
      data: null,
    });
  } catch (error) {
    try {
      const winner = await prisma.drawingFile.findUnique({
        where: { drawingId_fileId: { drawingId, fileId } },
        select: { storage: true, s3Key: true },
      });
      await cleanupUnusedS3Upload(s3Key, winner);
    } catch (lookupError) {
      console.warn("[files] Failed to reconcile an S3 upload", {
        s3Key,
        error: lookupError,
      });
    }
    throw error;
  }

  await cleanupUnusedS3Upload(s3Key, stored);
  return stored;
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
  prisma: Pick<PrismaClient, "$queryRaw" | "drawingFile">,
): Promise<Record<string, any>> => {
  const s3Enabled = isS3Enabled();
  const cfg = s3Enabled ? getS3Config() : null;
  const result: Record<string, any> = { ...files };

  // Bound parallel writes. Without this, a paste of N images fires N
  // parallel uploads, which can spike S3 connection pools (or open a burst
  // of DB writes) and produce inconsistent partial-failure states on shaky
  // networks.
  const UPLOAD_CONCURRENCY = 8;

  const entries = Object.entries(files).filter(([fileId, file]) => {
    if (!VALID_FILE_ID.test(fileId)) {
      // Reject path-traversal candidates rather than silently storing them
      // under a forged key. Drop from output so the bad entry never reaches
      // the database either.
      console.warn(
        `[files] Skipping file with invalid id: ${JSON.stringify(fileId)}`,
      );
      delete result[fileId];
      return false;
    }

    const dataURL: unknown = file?.dataURL;
    return typeof dataURL === "string" && base64Header.test(dataURL);
  });

  const processFile = async (
    [fileId, file]: [string, any],
    existing?: StoredFileMetadata,
  ): Promise<void> => {
    // File ids are immutable content hashes, just as on the raw upload route.
    // A stale client's inline copy must not rewrite bytes used by the current
    // scene or retained snapshots, even if its scene save later conflicts.
    let stored = existing;
    if (!stored) {
      const decoded = decodeDataURL(file.dataURL);
      if (!decoded) {
        delete result[fileId];
        return;
      }
      const { mimeType, buffer } = decoded;
      const s3Key = s3Enabled
        ? buildS3Key(
            userId,
            drawingId,
            fileId,
            MIME_TO_EXT[mimeType] ?? "bin",
            randomUUID(),
          )
        : null;
      stored = s3Key
        ? await uploadDrawingFileToS3(
            prisma,
            { drawingId, fileId, mimeType, s3Key },
            buffer,
          )
        : await storeDrawingFileOnce(prisma, {
            drawingId,
            fileId,
            mimeType,
            sizeBytes: buffer.length,
            storage: "db",
            s3Key: null,
            data: buffer,
          });
    }
    result[fileId] = {
      ...file,
      mimeType: stored.mimeType,
      dataURL:
        cfg?.publicUrl && stored.storage === "s3" && stored.s3Key
          ? getPublicUrl(stored.s3Key)
          : `/api/files/${drawingId}/${fileId}`,
    };
  };

  const LOOKUP_BATCH_SIZE = 256;
  for (let i = 0; i < entries.length; i += LOOKUP_BATCH_SIZE) {
    const batch = entries.slice(i, i + LOOKUP_BATCH_SIZE);
    const stored = await prisma.drawingFile.findMany({
      where: {
        drawingId,
        fileId: { in: batch.map(([fileId]) => fileId) },
        ...storedFileFilter,
      },
      select: { fileId: true, mimeType: true, storage: true, s3Key: true },
    });
    const byId = new Map(stored.map((row) => [row.fileId, row]));
    for (let j = 0; j < batch.length; j += UPLOAD_CONCURRENCY) {
      await Promise.all(
        batch
          .slice(j, j + UPLOAD_CONCURRENCY)
          .map((entry) => processFile(entry, byId.get(entry[0]))),
      );
    }
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
 * Also rebase managed references when duplicating a drawing so its preview
 * remains usable after the source is deleted or stops being shared.
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
      original.dataURL === processed.dataURL
    ) {
      continue;
    }
    rewritten = rewritten.split(original.dataURL).join(processed.dataURL);
  }
  return rewritten;
};
