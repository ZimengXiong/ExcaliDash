import { api } from "./client";

type FileStorageConfig = {
  s3Enabled: boolean;
  fileUploadMaxBytes?: number;
};

let fileStorageConfigCache: FileStorageConfig | null = null;
let fileStorageConfigInFlight: Promise<FileStorageConfig | null> | null = null;

const getFileStorageConfig = async (): Promise<FileStorageConfig | null> => {
  if (fileStorageConfigCache) return fileStorageConfigCache;
  if (fileStorageConfigInFlight) return fileStorageConfigInFlight;

  fileStorageConfigInFlight = (async () => {
    try {
      const response = await api.get<FileStorageConfig>("/files/config");
      fileStorageConfigCache = response.data;
      return fileStorageConfigCache;
    } catch {
      return null;
    } finally {
      fileStorageConfigInFlight = null;
    }
  })();

  return fileStorageConfigInFlight;
};

export const isS3Enabled = async (): Promise<boolean> =>
  (await getFileStorageConfig())?.s3Enabled === true;

/** The server's existing per-image cap, when this backend exposes it. */
export const getFileUploadMaxBytes = async (): Promise<number | null> => {
  const limit = (await getFileStorageConfig())?.fileUploadMaxBytes;
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0
    ? limit
    : null;
};

export type TrimResult = {
  trimmed: {
    elementsRemoved: number;
    filesRemoved: number;
    s3ObjectsDeleted: number;
    s3DeleteErrors: number;
  };
};

export type FileDiffEntry = {
  fileId: string;
  inCanvas: boolean;
  inCanvasActive: boolean;
  inSqlite: boolean;
  inS3: boolean;
  inS3Record: boolean;
  s3Key: string | null;
  mimeType: string | null;
  s3SizeBytes: number | null;
};

export type FilesDiffResult = {
  summary: {
    totalCanvasRefs: number;
    totalSqliteFiles: number;
    totalS3Files: number;
  };
  files: FileDiffEntry[];
};

export type DeleteOrphansResult = {
  deleted: number;
  errors: number;
};

export const trimDrawing = async (id: string, confirmName: string): Promise<TrimResult> => {
  const response = await api.post<TrimResult>(`/drawings/${id}/trim`, { confirmName });
  return response.data;
};

export const getFilesDiff = async (id: string): Promise<FilesDiffResult> => {
  const response = await api.get<FilesDiffResult>(`/drawings/${id}/files/diff`);
  return response.data;
};

export const deleteOrphanFiles = async (
  id: string,
  confirmName: string,
  fileIds: string[],
): Promise<DeleteOrphansResult> => {
  const response = await api.delete<DeleteOrphansResult>(`/drawings/${id}/files/orphans`, {
    data: { confirmName, fileIds },
  });
  return response.data;
};
