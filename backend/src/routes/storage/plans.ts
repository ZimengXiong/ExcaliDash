import {
  buildFilesDiff,
  collectReferencedFileIds,
  fileIdFromS3Key,
  type StoredFileRecord,
  type S3ObjectRecord,
} from "./helpers";

export type FilesJson = Record<string, any>;

export const buildTrimPlan = (elements: any[], files: FilesJson) => {
  const activeElements = elements.filter((el) => !el.isDeleted);
  const survivingFileIds = collectReferencedFileIds(activeElements, false);
  const cleanedFiles: FilesJson = {};

  for (const [fileId, value] of Object.entries(files)) {
    if (survivingFileIds.has(fileId)) {
      cleanedFiles[fileId] = value;
    }
  }

  return {
    activeElements,
    cleanedFiles,
    survivingFileIds,
    elementsRemoved: elements.length - activeElements.length,
    filesRemoved: Object.keys(files).length - Object.keys(cleanedFiles).length,
  };
};

export const buildTrimS3CleanupPlan = ({
  survivingFileIds,
  storedRecords,
  s3Objects,
}: {
  survivingFileIds: Set<string>;
  storedRecords: StoredFileRecord[];
  s3Objects: S3ObjectRecord[];
}) => {
  const orphanKeys = new Set<string>();
  const orphanFileIds = new Set<string>();

  for (const record of storedRecords) {
    if (!survivingFileIds.has(record.fileId)) {
      // db-mode rows have no s3Key/object; only their DrawingFile row needs
      // to be reclaimed. s3-mode rows also strand an object to delete.
      if (record.s3Key) orphanKeys.add(record.s3Key);
      orphanFileIds.add(record.fileId);
    }
  }

  for (const obj of s3Objects) {
    const fileId = fileIdFromS3Key(obj.key);
    if (fileId && !survivingFileIds.has(fileId)) {
      orphanKeys.add(obj.key);
    }
  }

  return {
    orphanKeys: Array.from(orphanKeys),
    orphanFileIds: Array.from(orphanFileIds),
  };
};

export const buildFilesDiffResponse = ({
  elements,
  files,
  storedRecords,
  s3Objects,
}: {
  elements: any[];
  files: FilesJson;
  storedRecords: StoredFileRecord[];
  s3Objects: S3ObjectRecord[];
}) => {
  const allCanvasRefs = collectReferencedFileIds(elements, true);
  const activeCanvasRefs = collectReferencedFileIds(elements, false);
  const sqliteFileIds = new Set(Object.keys(files));
  // In db-mode there are no S3 objects; the stored-blob count is the number
  // of DrawingFile rows instead.
  const totalStoredFiles =
    s3Objects.length > 0 ? s3Objects.length : storedRecords.length;

  return {
    summary: {
      totalCanvasRefs: allCanvasRefs.size,
      totalSqliteFiles: sqliteFileIds.size,
      totalS3Files: totalStoredFiles,
    },
    files: buildFilesDiff({
      allCanvasRefs,
      activeCanvasRefs,
      sqliteFileIds,
      storedRecords,
      s3Objects,
    }),
  };
};

export const buildOrphanDeletePlan = ({
  elements,
  files,
  fileIds,
}: {
  elements: any[];
  files: FilesJson;
  fileIds: string[];
}) => {
  const activeRefs = collectReferencedFileIds(elements, false);
  const blockedIds = fileIds.filter((fid) => activeRefs.has(fid));
  const deletedFileIdSet = new Set(fileIds);
  const cleanedFiles = { ...files };

  for (const fileId of fileIds) {
    delete cleanedFiles[fileId];
  }

  const cleanedElements = elements.filter((el: any) => {
    return !(
      el.isDeleted &&
      el.type === "image" &&
      typeof el.fileId === "string" &&
      deletedFileIdSet.has(el.fileId)
    );
  });

  return {
    blockedIds,
    cleanedFiles,
    cleanedElements,
    deletedCount: fileIds.length,
  };
};
