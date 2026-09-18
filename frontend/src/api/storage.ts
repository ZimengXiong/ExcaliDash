import { api } from "./client";

let s3EnabledCache: boolean | null = null;
let s3EnabledInFlight: Promise<boolean> | null = null;

export const isS3Enabled = async (): Promise<boolean> => {
  if (s3EnabledCache !== null) return s3EnabledCache;
  if (s3EnabledInFlight) return s3EnabledInFlight;

  s3EnabledInFlight = (async () => {
    try {
      const response = await api.get<{ s3Enabled: boolean }>("/files/config");
      s3EnabledCache = response.data.s3Enabled === true;
      return s3EnabledCache;
    } catch {
      return false;
    } finally {
      s3EnabledInFlight = null;
    }
  })();

  return s3EnabledInFlight;
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

export const trimDrawing = async (
  id: string,
  confirmName: string,
): Promise<TrimResult> => {
  const response = await api.post<TrimResult>(`/drawings/${id}/trim`, {
    confirmName,
  });
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
  const response = await api.delete<DeleteOrphansResult>(
    `/drawings/${id}/files/orphans`,
    {
      data: { confirmName, fileIds },
    },
  );
  return response.data;
};
