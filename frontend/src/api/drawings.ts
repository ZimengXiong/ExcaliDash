import type { Drawing, DrawingSummary } from "../types";
import { normalizePreviewSvg } from "../utils/previewSvg";
import { api, isAxiosError } from "./client";

// Per-file image upload capability. The endpoint below is served by newer
// backends only; against an older server the route 404s (or 501s). The first
// such response flips this flag off for the rest of the session so callers stop
// attempting per-file uploads and fall back to inlining bytes in the scene PUT
// (which the server still interns) — a new frontend degrades to old behavior.
let fileUploadSupported = true;

export const isFileUploadSupported = (): boolean => fileUploadSupported;

export type UploadedFileRef = { url: string };

/**
 * Upload the raw bytes of a single drawing image to
 * `PUT /drawings/:drawingId/files/:fileId`. Idempotent and content-addressed:
 * `fileId` is Excalidraw's content hash, so re-uploading is a no-op.
 *
 * Returns the ref URL to store in place of the inline dataURL, or `null` when
 * the backend does not support per-file uploads (404/501) — in which case the
 * capability is disabled for the session and the caller keeps the inline bytes.
 * Other errors (network, 413, 5xx) are thrown so the caller can retry.
 */
export const uploadDrawingFile = async (
  drawingId: string,
  fileId: string,
  body: ArrayBuffer | Uint8Array | Blob,
  mimeType: string,
): Promise<UploadedFileRef | null> => {
  if (!fileUploadSupported) return null;
  try {
    const response = await api.put<{ url?: string }>(
      `/drawings/${drawingId}/files/${fileId}`,
      body,
      {
        headers: {
          "Content-Type": mimeType || "application/octet-stream",
        },
      },
    );
    const url =
      typeof response.data?.url === "string" && response.data.url.length > 0
        ? response.data.url
        : `/api/files/${drawingId}/${fileId}`;
    return { url };
  } catch (err) {
    if (
      isAxiosError(err) &&
      (err.response?.status === 404 || err.response?.status === 501)
    ) {
      fileUploadSupported = false;
      return null;
    }
    throw err;
  }
};

const coerceTimestamp = (value: string | number | Date): number => {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

type TimestampValue = string | number | Date;

interface HasTimestamps {
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
}

const deserializeTimestamps = <T extends HasTimestamps>(
  data: T,
): T & { createdAt: number; updatedAt: number } => ({
  ...data,
  createdAt: coerceTimestamp(data.createdAt),
  updatedAt: coerceTimestamp(data.updatedAt),
});

const deserializeDrawingSummary = (drawing: unknown): DrawingSummary => {
  if (typeof drawing !== "object" || drawing === null) throw new Error("Invalid drawing data");
  const parsed = drawing as HasTimestamps & DrawingSummary;
  return deserializeTimestamps({
    ...parsed,
    preview:
      typeof parsed.preview === "string"
        ? normalizePreviewSvg(parsed.preview)
        : parsed.preview,
  });
};

const deserializeDrawing = (drawing: unknown): Drawing => {
  if (typeof drawing !== "object" || drawing === null) throw new Error("Invalid drawing data");
  const parsed = drawing as HasTimestamps & Drawing;
  return deserializeTimestamps({
    ...parsed,
    preview:
      typeof parsed.preview === "string"
        ? normalizePreviewSvg(parsed.preview)
        : parsed.preview,
  });
};

export interface PaginatedDrawings<T> {
  drawings: T[];
  totalCount: number;
  limit?: number;
  offset?: number;
}

export type DrawingSortField = "name" | "createdAt" | "updatedAt";
export type SortDirection = "asc" | "desc";

type DrawingQueryOptions = {
  includeData?: boolean;
  limit?: number;
  offset?: number;
  sortField?: DrawingSortField;
  sortDirection?: SortDirection;
};

const buildDrawingParams = (
  search?: string,
  collectionId?: string | null,
  options?: DrawingQueryOptions,
): Record<string, string | number> => {
  const params: Record<string, string | number> = {};
  if (search) params.search = search;
  if (collectionId !== undefined) params.collectionId = collectionId === null ? "null" : collectionId;
  if (options?.limit !== undefined) params.limit = options.limit;
  if (options?.offset !== undefined) params.offset = options.offset;
  if (options?.sortField) params.sortField = options.sortField;
  if (options?.sortDirection) params.sortDirection = options.sortDirection;
  return params;
};

export function getDrawings(
  search?: string,
  collectionId?: string | null,
  options?: Omit<DrawingQueryOptions, "includeData">,
): Promise<PaginatedDrawings<DrawingSummary>>;

export function getDrawings(
  search: string | undefined,
  collectionId: string | null | undefined,
  options: DrawingQueryOptions & { includeData: true },
): Promise<PaginatedDrawings<Drawing>>;

export async function getDrawings(
  search?: string,
  collectionId?: string | null,
  options?: DrawingQueryOptions,
) {
  const params = buildDrawingParams(search, collectionId, options);
  if (options?.includeData) {
    params.includeData = "true";
    const response = await api.get<PaginatedDrawings<Drawing>>("/drawings", { params });
    return { ...response.data, drawings: response.data.drawings.map(deserializeDrawing) };
  }
  const response = await api.get<PaginatedDrawings<DrawingSummary>>("/drawings", { params });
  return { ...response.data, drawings: response.data.drawings.map(deserializeDrawingSummary) };
}

export async function getSharedDrawings(
  search?: string,
  options?: Omit<DrawingQueryOptions, "includeData">,
): Promise<PaginatedDrawings<DrawingSummary>> {
  const params = buildDrawingParams(search, undefined, options);
  const response = await api.get<PaginatedDrawings<DrawingSummary>>("/drawings/shared", { params });
  return { ...response.data, drawings: response.data.drawings.map(deserializeDrawingSummary) };
}

export const getDrawing = async (id: string) => {
  const response = await api.get<Drawing>(`/drawings/${id}`);
  return deserializeDrawing(response.data);
};

// Previews are no longer inlined into list responses; fetch them per-drawing.
// The endpoint is ETag-cacheable (revalidates on updatedAt), so repeated calls
// are cheap once the browser has a copy.
export const getDrawingPreview = async (id: string): Promise<string | null> => {
  const response = await api.get<{ preview: string | null }>(
    `/drawings/${id}/preview`,
  );
  const preview = response.data?.preview;
  return typeof preview === "string" ? normalizePreviewSvg(preview) : null;
};

export type ShareResolvedUser = { id: string; name: string; email: string };

export const resolveShareUsers = async (
  drawingId: string,
  q: string,
): Promise<ShareResolvedUser[]> => {
  const response = await api.get<{ users: ShareResolvedUser[] }>(
    `/drawings/${drawingId}/share-resolve`,
    { params: { q } },
  );
  return response.data.users;
};

export type DrawingPermissionRow = {
  id: string;
  granteeUserId: string;
  permission: "view" | "edit";
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
  granteeUser: ShareResolvedUser;
};

export type DrawingLinkShareRow = {
  id: string;
  permission: "view" | "edit";
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
  lastUsedAt: string | null;
};

export const getDrawingSharing = async (
  drawingId: string,
): Promise<{ permissions: DrawingPermissionRow[]; linkShares: DrawingLinkShareRow[] }> => {
  const response = await api.get<{ permissions: DrawingPermissionRow[]; linkShares: DrawingLinkShareRow[] }>(
    `/drawings/${drawingId}/sharing`,
  );
  return response.data;
};

export const upsertDrawingPermission = async (
  drawingId: string,
  params: { granteeUserId: string; permission: "view" | "edit" },
): Promise<{ permission: DrawingPermissionRow }> => {
  const response = await api.post<{ permission: DrawingPermissionRow }>(
    `/drawings/${drawingId}/permissions`,
    params,
  );
  return response.data;
};

export const revokeDrawingPermission = async (
  drawingId: string,
  permissionId: string,
): Promise<{ success: true }> => {
  const response = await api.delete<{ success: true }>(
    `/drawings/${drawingId}/permissions/${permissionId}`,
  );
  return response.data;
};

// Recipient-scoped: hide/unhide a drawing shared with the current user from
// their own "Shared with me" list. Does not affect the owner or other grantees.
export const setSharedDrawingHidden = async (
  drawingId: string,
  hidden: boolean,
): Promise<{ success: true; hidden: boolean }> => {
  const response = await api.patch<{ success: true; hidden: boolean }>(
    `/drawings/${drawingId}/shared-visibility`,
    { hidden },
  );
  return response.data;
};

export const createLinkShare = async (
  drawingId: string,
  params: { permission: "view" | "edit"; expiresAt?: string | null; passphrase?: string },
): Promise<{ share: DrawingLinkShareRow }> => {
  const response = await api.post<{ share: DrawingLinkShareRow }>(
    `/drawings/${drawingId}/link-shares`,
    params,
  );
  return response.data;
};

export const revokeLinkShare = async (
  drawingId: string,
  shareId: string,
): Promise<{ success: true }> => {
  const response = await api.delete<{ success: true }>(
    `/drawings/${drawingId}/link-shares/${shareId}`,
  );
  return response.data;
};

// Per-drawing agent tokens (owner-only). The raw token is returned exactly once
// at creation; afterwards only the prefix is available.
export type AgentTokenRow = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
};

export const listAgentTokens = async (
  drawingId: string,
): Promise<AgentTokenRow[]> => {
  const response = await api.get<{ agentTokens: AgentTokenRow[] }>(
    `/drawings/${drawingId}/agent-tokens`,
  );
  return response.data.agentTokens;
};

export const createAgentToken = async (
  drawingId: string,
  params?: { name?: string },
): Promise<{ agentToken: AgentTokenRow; token: string }> => {
  const response = await api.post<{ agentToken: AgentTokenRow; token: string }>(
    `/drawings/${drawingId}/agent-tokens`,
    params ?? {},
  );
  return response.data;
};

export const revokeAgentToken = async (
  drawingId: string,
  tokenId: string,
): Promise<{ success: true }> => {
  const response = await api.delete<{ success: true }>(
    `/drawings/${drawingId}/agent-tokens/${tokenId}`,
  );
  return response.data;
};

export const createDrawing = async (name?: string, collectionId?: string | null) => {
  const response = await api.post<{ id: string }>("/drawings", {
    name: name || "Untitled Drawing",
    collectionId: collectionId ?? null,
    elements: [],
    appState: {},
  });
  return response.data;
};

export const updateDrawing = async (id: string, data: Partial<Drawing>) => {
  const response = await api.put<Drawing>(`/drawings/${id}`, data);
  return deserializeDrawing(response.data);
};

export const deleteDrawing = async (id: string) => {
  const response = await api.delete<{ success: true }>(`/drawings/${id}`);
  return response.data;
};

export const duplicateDrawing = async (id: string) => {
  const response = await api.post<Drawing>(`/drawings/${id}/duplicate`);
  return deserializeDrawing(response.data);
};

export type DrawingSnapshotSummary = { id: string; version: number; createdAt: string };

export type DrawingSnapshotFull = DrawingSnapshotSummary & {
  drawingId: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

export const getDrawingHistory = async (
  drawingId: string,
  options?: { limit?: number; offset?: number },
): Promise<{ snapshots: DrawingSnapshotSummary[]; totalCount: number }> => {
  const params: Record<string, number> = {};
  if (options?.limit) params.limit = options.limit;
  if (options?.offset) params.offset = options.offset;
  const response = await api.get(`/drawings/${drawingId}/history`, { params });
  return response.data;
};

export const getDrawingSnapshot = async (
  drawingId: string,
  snapshotId: string,
): Promise<DrawingSnapshotFull> => {
  const response = await api.get(`/drawings/${drawingId}/history/${snapshotId}`);
  return response.data;
};

export const restoreDrawingSnapshot = async (
  drawingId: string,
  snapshotId: string,
): Promise<Drawing> => {
  const response = await api.post(`/drawings/${drawingId}/history/${snapshotId}/restore`);
  return deserializeDrawing(response.data);
};
