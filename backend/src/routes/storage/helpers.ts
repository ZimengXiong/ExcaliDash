/**
 * A stored-blob record from the DrawingFile table. `storage` selects the
 * backend: "db" rows keep bytes inline (s3Key is null); "s3" rows point at
 * an S3 object via s3Key.
 */
export type StoredFileRecord = {
  fileId: string;
  storage: string;
  s3Key: string | null;
  mimeType: string;
  sizeBytes: number;
};

export type S3ObjectRecord = {
  key: string;
  size: number;
};

export const VALID_STORAGE_FILE_ID = /^[\w-]{1,200}$/;

export const collectReferencedFileIds = (
  elements: any[],
  includeDeleted: boolean,
): Set<string> => {
  const ids = new Set<string>();
  for (const el of elements) {
    if (!includeDeleted && el.isDeleted) continue;
    if (el.type === "image" && typeof el.fileId === "string" && el.fileId) {
      ids.add(el.fileId);
    }
  }
  return ids;
};

export const fileIdFromS3Key = (key: string): string | null => {
  const lastSegment = key.split("/").pop();
  if (!lastSegment) return null;
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex <= 0) return lastSegment;
  return lastSegment.substring(0, dotIndex);
};

export const buildFilesDiff = ({
  allCanvasRefs,
  activeCanvasRefs,
  sqliteFileIds,
  storedRecords,
  s3Objects,
}: {
  allCanvasRefs: Set<string>;
  activeCanvasRefs: Set<string>;
  sqliteFileIds: Set<string>;
  storedRecords: StoredFileRecord[];
  s3Objects: S3ObjectRecord[];
}) => {
  const recordMap = new Map(storedRecords.map((record) => [record.fileId, record]));
  const s3ObjectMap = new Map(
    s3Objects.map((object) => [fileIdFromS3Key(object.key), object] as const),
  );
  const allFileIds = new Set<string>([
    ...allCanvasRefs,
    ...sqliteFileIds,
    ...storedRecords.map((record) => record.fileId),
  ]);
  for (const object of s3Objects) {
    const fileId = fileIdFromS3Key(object.key);
    if (fileId) allFileIds.add(fileId);
  }

  return Array.from(allFileIds).map((fileId) => {
    const record = recordMap.get(fileId);
    const s3Object = s3ObjectMap.get(fileId);
    return {
      fileId,
      inCanvas: allCanvasRefs.has(fileId),
      inCanvasActive: activeCanvasRefs.has(fileId),
      inSqlite: sqliteFileIds.has(fileId),
      // In db-mode there is no S3 object; a DrawingFile row (storage="db")
      // that carries bytes is the equivalent "object present" signal.
      inS3: Boolean(s3Object) || record?.storage === "db",
      inS3Record: Boolean(record),
      s3Key: record?.s3Key ?? s3Object?.key ?? null,
      mimeType: record?.mimeType ?? null,
      s3SizeBytes: s3Object?.size ?? record?.sizeBytes ?? null,
    };
  });
};
