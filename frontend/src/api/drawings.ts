import type { Drawing, DrawingSummary } from "../types";
import { normalizePreviewSvg } from "../utils/previewSvg";
import { API_URL, api, isAxiosError } from "./client";

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
  if (typeof drawing !== "object" || drawing === null)
    throw new Error("Invalid drawing data");
  const parsed = drawing as HasTimestamps & DrawingSummary;
  return deserializeTimestamps(parsed);
};

const deserializeDrawing = (drawing: unknown): Drawing => {
  if (typeof drawing !== "object" || drawing === null)
    throw new Error("Invalid drawing data");
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
  if (collectionId !== undefined)
    params.collectionId = collectionId === null ? "null" : collectionId;
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
    const response = await api.get<PaginatedDrawings<Drawing>>("/drawings", {
      params,
    });
    return {
      ...response.data,
      drawings: response.data.drawings.map(deserializeDrawing),
    };
  }
  const response = await api.get<PaginatedDrawings<DrawingSummary>>(
    "/drawings",
    { params },
  );
  return {
    ...response.data,
    drawings: response.data.drawings.map(deserializeDrawingSummary),
  };
}

export async function getSharedDrawings(
  search?: string,
  options?: Omit<DrawingQueryOptions, "includeData">,
): Promise<PaginatedDrawings<DrawingSummary>> {
  const params = buildDrawingParams(search, undefined, options);
  const response = await api.get<PaginatedDrawings<DrawingSummary>>(
    "/drawings/shared",
    { params },
  );
  return {
    ...response.data,
    drawings: response.data.drawings.map(deserializeDrawingSummary),
  };
}

export const getDrawing = async (
  id: string,
  options?: { omitPreview?: boolean; signal?: AbortSignal },
) => {
  // The editor only needs to know whether a thumbnail exists; skipping it can
  // remove most of the response for image-heavy drawings.
  const response = await api.get<Drawing & { hasPreview?: boolean }>(
    `/drawings/${id}`,
    {
      params: options?.omitPreview ? { omitPreview: 1 } : undefined,
      signal: options?.signal,
    },
  );
  // A proxy or auth gateway can answer 200 with an HTML page or a different
  // shape. Opening that as an empty, editable canvas would let an autosave
  // overwrite the real drawing.
  const data: unknown = response.data;
  const drawing =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : null;
  if (
    !drawing ||
    drawing.id !== id ||
    !Array.isArray(drawing.elements) ||
    typeof drawing.version !== "number" ||
    !Number.isInteger(drawing.version) ||
    (drawing.accessLevel !== "view" &&
      drawing.accessLevel !== "edit" &&
      drawing.accessLevel !== "owner")
  ) {
    throw new Error("Unexpected response while loading drawing");
  }
  return deserializeDrawing(drawing);
};

// Previews are no longer inlined into list responses; fetch them per-drawing.
// The endpoint is ETag-cacheable (revalidates on updatedAt), so repeated calls
// are cheap once the browser has a copy.
export const getDrawingPreview = async (
  id: string,
  signal?: AbortSignal,
): Promise<string | null> => {
  const response = await api.get<{ preview: string | null }>(
    `/drawings/${id}/preview`,
    { signal },
  );
  const preview = response.data?.preview;
  return typeof preview === "string" ? preview : null;
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
): Promise<{
  permissions: DrawingPermissionRow[];
  linkShares: DrawingLinkShareRow[];
}> => {
  const response = await api.get<{
    permissions: DrawingPermissionRow[];
    linkShares: DrawingLinkShareRow[];
  }>(`/drawings/${drawingId}/sharing`);
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
  params: {
    permission: "view" | "edit";
    expiresAt?: string | null;
    passphrase?: string;
  },
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

export const createDrawing = async (
  name?: string,
  collectionId?: string | null,
) => {
  const response = await api.post<{ id: string }>("/drawings", {
    name: name || "Untitled Drawing",
    collectionId: collectionId ?? null,
    appState: {},
    elements: [],
  });
  return response.data;
};

export const updateDrawing = async (id: string, data: Partial<Drawing>) => {
  const response = await api.put<Drawing>(`/drawings/${id}`, data);
  return deserializeDrawing(response.data);
};

export type DrawingSaveResult = {
  id: string;
  version: number;
  updatedAt: number;
};

// Scene JSON compresses ~10x. Large saves are gzipped so autosave on a slow
// uplink sends hundreds of KB instead of megabytes; Express inflates
// `Content-Encoding: gzip` bodies natively (BODY_LIMIT_MB applies inflated).
const GZIP_MIN_BYTES = 64 * 1024;
let gzipRequestsUnsupported = false;

const gzipJson = async (json: string): Promise<Blob | null> => {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([json])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
};

// A save response must describe the drawing just written. A proxy or auth
// gateway can answer 200 with an HTML page; treating that as success would
// mark unsaved edits as persisted.
const parseSaveResult = (id: string, data: unknown): DrawingSaveResult => {
  const result =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : null;
  const updatedAt =
    typeof result?.updatedAt === "string" ? Date.parse(result.updatedAt) : NaN;
  if (
    !result ||
    typeof result.id !== "string" ||
    result.id.length === 0 ||
    result.id !== id ||
    typeof result.version !== "number" ||
    !Number.isInteger(result.version) ||
    Number.isNaN(updatedAt)
  ) {
    throw new Error("Unexpected response while saving drawing");
  }
  return { ...result, id, version: result.version, updatedAt };
};

// A cross-origin backend older than these headers rejects them in the CORS
// preflight. After one plain JSON save succeeds, keep using plain saves.
let legacySaveRequests = false;

const isCrossOriginApi = (): boolean => {
  try {
    return (
      new URL(API_URL, window.location.href).origin !== window.location.origin
    );
  } catch {
    return false;
  }
};

/** Save a scene and request only the resulting metadata. */
export const saveDrawing = async (
  id: string,
  data: Partial<Drawing> & { expectedVersion?: number },
  options?: { socketId?: string | null },
): Promise<DrawingSaveResult> => {
  const json = JSON.stringify(data);
  const put = (body: Blob | string, headers: Record<string, string> = {}) =>
    api.put<unknown>(`/drawings/${id}`, body, {
      headers: { "Content-Type": "application/json", ...headers },
    });
  if (legacySaveRequests) return parseSaveResult(id, (await put(json)).data);

  const headers: Record<string, string> = {
    Prefer: "return=minimal",
    ...(options?.socketId ? { "X-Socket-Id": options.socketId } : {}),
  };
  const gzipped =
    !gzipRequestsUnsupported && json.length >= GZIP_MIN_BYTES
      ? await gzipJson(json)
      : null;
  const putPreferred = async () => {
    if (!gzipped) return put(json, headers);
    try {
      return await put(gzipped, { ...headers, "Content-Encoding": "gzip" });
    } catch (err) {
      // 415: encoding unsupported. 400: a proxy may strip Content-Encoding
      // while forwarding the compressed bytes. 413 stays a size error.
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status !== 400 && status !== 415) throw err;
      const response = await put(json, headers);
      gzipRequestsUnsupported = true;
      return response;
    }
  };

  let response;
  try {
    response = await putPreferred();
  } catch (err) {
    if (!isAxiosError(err) || err.response || !isCrossOriginApi()) throw err;
    response = await put(json);
    legacySaveRequests = true;
  }
  return parseSaveResult(id, response.data);
};

// `requireTrashed` makes the server refuse (409) a drawing that is no longer
// in Trash, e.g. because another tab restored it.
export const deleteDrawing = async (
  id: string,
  options?: { requireTrashed?: boolean },
) => {
  const response = await api.delete<{ success: true }>(`/drawings/${id}`, {
    params: options?.requireTrashed ? { requireTrashed: 1 } : undefined,
  });
  return response.data;
};

export const duplicateDrawing = async (id: string) => {
  const response = await api.post<Drawing>(`/drawings/${id}/duplicate`);
  return deserializeDrawing(response.data);
};

export type DrawingSnapshotSummary = {
  id: string;
  version: number;
  createdAt: string;
};

export type DrawingSnapshotFull = DrawingSnapshotSummary & {
  drawingId: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

export const getDrawingHistory = async (
  drawingId: string,
  options?: { limit?: number; offset?: number },
): Promise<{
  snapshots: DrawingSnapshotSummary[];
  totalCount: number;
  retentionDays?: number;
}> => {
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
  const response = await api.get(
    `/drawings/${drawingId}/history/${snapshotId}`,
  );
  return response.data;
};

export const restoreDrawingSnapshot = async (
  drawingId: string,
  snapshotId: string,
): Promise<Drawing> => {
  const response = await api.post(
    `/drawings/${drawingId}/history/${snapshotId}/restore`,
  );
  return deserializeDrawing(response.data);
};
