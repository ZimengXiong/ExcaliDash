import { downloadBuffer } from "../../s3";

type ExportFileRecord = {
  fileId: string;
  mimeType: string;
  storage: string;
  s3Key: string | null;
  data: Uint8Array | Buffer | null;
};

export class MissingBackupImagesError extends Error {
  constructor(
    readonly count: number,
    fileIds: string[] = [],
  ) {
    super(`Could not bundle ${count} drawing image(s): ${fileIds.join(", ")}`);
    this.name = "MissingBackupImagesError";
  }
}

type ExcalidrawFile = Record<string, unknown> & { dataURL?: unknown };

const isUnmanagedExternalReference = (value: string): boolean => {
  if (value.length > 2048 || !/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    // Absolute URLs to the managed endpoint still require stored bytes.
    return !/^\/api\/files(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
};

/**
 * Make exported drawings portable by replacing managed file references with
 * inline data URLs. DrawingFile is authoritative even when Drawing.files has
 * a public CDN URL rather than an /api/files URL.
 * Imported external HTTP(S) references without a DrawingFile remain unchanged,
 * as supported by the v1 backup importer. Never fetch user-supplied URLs here:
 * these images remain dependent on their original host rather than portable.
 */
export const embedDrawingFilesForExport = async (
  files: Record<string, unknown>,
  records: ExportFileRecord[],
  reportMissing?: (fileId: string) => void,
  managedDataUrls = new Map<string, string>(),
): Promise<Record<string, unknown>> => {
  const embedded = { ...files };
  for (const record of records) {
    const file = embedded[record.fileId];
    if (!file || typeof file !== "object" || Array.isArray(file)) continue;

    const cachedDataUrl = managedDataUrls.get(record.fileId);
    if (cachedDataUrl !== undefined) {
      embedded[record.fileId] = { ...file, dataURL: cachedDataUrl };
      continue;
    }

    let bytes: Buffer;
    if (record.storage === "db") {
      if (!record.data || record.data.byteLength === 0) {
        throw new Error(
          `Stored drawing file is missing database bytes: ${record.fileId}`,
        );
      }
      bytes = Buffer.isBuffer(record.data)
        ? record.data
        : Buffer.from(record.data);
    } else if (record.storage === "s3") {
      if (!record.s3Key) {
        throw new Error(
          `Stored drawing file is missing its S3 key: ${record.fileId}`,
        );
      }
      bytes = await downloadBuffer(record.s3Key);
      if (bytes.length === 0)
        throw new Error(`Stored drawing file has no bytes: ${record.fileId}`);
    } else {
      throw new Error(`Unsupported drawing file storage: ${record.storage}`);
    }

    const dataURL = `data:${record.mimeType};base64,${bytes.toString("base64")}`;
    managedDataUrls.set(record.fileId, dataURL);
    embedded[record.fileId] = { ...file, dataURL };
  }

  const unresolved = Object.entries(embedded)
    .filter(([, file]) => {
      if (!file || typeof file !== "object" || Array.isArray(file))
        return false;
      const dataURL = (file as ExcalidrawFile).dataURL;
      return (
        typeof dataURL === "string" &&
        dataURL.length > 0 &&
        !dataURL.startsWith("data:") &&
        !isUnmanagedExternalReference(dataURL)
      );
    })
    .map(([fileId]) => fileId);
  // Recovery exports retain already-dangling managed references. Do not
  // fetch arbitrary URLs or borrow bytes from another drawing/account.
  const missing = unresolved.filter((fileId) => {
    const value = (embedded[fileId] as ExcalidrawFile).dataURL as string;
    let pathname = value;
    if (/^https?:\/\//i.test(value)) {
      try {
        pathname = new URL(value).pathname;
      } catch {
        return false;
      }
    }
    return /^\/api\/files\/[\w-]{1,200}\/[\w-]{1,200}$/.test(pathname);
  });
  const unsupported = unresolved.filter((fileId) => !missing.includes(fileId));
  if (unsupported.length > 0) {
    throw new Error(
      `Could not bundle ${unresolved.length} drawing image(s): ${unresolved.join(", ")}`,
    );
  }
  if (missing.length > 0) {
    if (!reportMissing)
      throw new MissingBackupImagesError(missing.length, missing);
    missing.forEach(reportMissing);
  }

  return embedded;
};
