/**
 * Utility for scanning drawing file records and uploading base64 dataURLs to S3.
 * This is the single interception point for all image uploads on the backend.
 */
import type { PrismaClient } from "./generated/client";
import { isS3Enabled, getS3Config, uploadBuffer, getPublicUrl } from "./s3";

const FILE_KEY_PREFIX =
  process.env.S3_KEY_PREFIX?.replace(/\/+$/, "") || "excalidash";

/**
 * Reject anything that could escape the per-user/per-drawing S3 prefix.
 * Same shape used by `/files/:fileId` validation.
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
    const s3Key = `${FILE_KEY_PREFIX}/${userId}/${drawingId}/${fileId}.${ext}`;

    await uploadBuffer(s3Key, decoded.buffer, decoded.mimeType);

    // Determine the access URL for this file
    const accessUrl = cfg.publicUrl
      ? getPublicUrl(s3Key)
      : `/api/files/${fileId}`;

    // Persist the S3File record so private-bucket deployments can serve it
    await prisma.s3File.upsert({
      where: { id: fileId },
      create: { id: fileId, userId, s3Key, mimeType: decoded.mimeType },
      update: { s3Key, mimeType: decoded.mimeType },
    });

    result[fileId] = { ...file, dataURL: accessUrl };
  });

  await Promise.all(uploadTasks);

  return result;
};
