import { APIRequestContext, expect } from "@playwright/test";

const DEFAULT_API_URL = "http://127.0.0.1:8000";
export const API_URL = process.env.API_URL || DEFAULT_API_URL;
const resolveApiUrl = () => process.env.API_URL || API_URL || DEFAULT_API_URL;

type CsrfTokenResponse = {
  token: string;
  header?: string;
};

type CsrfInfo = {
  token: string;
  headerName: string;
};

const csrfInfoByRequest = new WeakMap<APIRequestContext, CsrfInfo>();
const csrfFetchByRequest = new WeakMap<APIRequestContext, Promise<CsrfInfo>>();

const fetchCsrfInfo = async (request: APIRequestContext): Promise<CsrfInfo> => {
  const response = await request.get(`${resolveApiUrl()}/csrf-token`, {
    headers: { origin: process.env.BASE_URL || "http://127.0.0.1:5173" },
  });
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to fetch CSRF token: ${response.status()} ${text || "(empty response)"}`);
  }

  const data = (await response.json()) as CsrfTokenResponse;
  if (!data || typeof data.token !== "string" || data.token.trim().length === 0) {
    throw new Error("Failed to fetch CSRF token: missing token in response");
  }

  const headerName = typeof data.header === "string" && data.header.trim().length > 0 ? data.header : "x-csrf-token";
  return { token: data.token, headerName };
};

const getCsrfInfo = async (request: APIRequestContext): Promise<CsrfInfo> => {
  const cached = csrfInfoByRequest.get(request);
  if (cached) return cached;

  const inFlight = csrfFetchByRequest.get(request);
  if (inFlight) return inFlight;

  const promise = fetchCsrfInfo(request)
    .then((info) => {
      csrfInfoByRequest.set(request, info);
      return info;
    })
    .finally(() => {
      csrfFetchByRequest.delete(request);
    });

  csrfFetchByRequest.set(request, promise);
  return promise;
};

const refreshCsrfInfo = async (request: APIRequestContext): Promise<CsrfInfo> => {
  const promise = fetchCsrfInfo(request)
    .then((info) => {
      csrfInfoByRequest.set(request, info);
      return info;
    })
    .finally(() => {
      csrfFetchByRequest.delete(request);
    });

  csrfFetchByRequest.set(request, promise);
  return promise;
};

export async function getCsrfHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const info = await getCsrfInfo(request);
  return {
    [info.headerName]: info.token,
    origin: process.env.BASE_URL || "http://127.0.0.1:5173",
  };
}

const withCsrfHeaders = async (
  request: APIRequestContext,
  headers: Record<string, string> = {}
): Promise<Record<string, string>> => ({
  ...headers,
  ...(await getCsrfHeaders(request)),
});

export interface DrawingRecord {
  id: string;
  name: string;
  collectionId: string | null;
  preview?: string | null;
  version?: number;
  createdAt?: number | string;
  updatedAt?: number | string;
  elements?: any[];
  appState?: Record<string, any> | null;
  files?: Record<string, any>;
}

export interface CollectionRecord {
  id: string;
  name: string;
  createdAt?: number | string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  username?: string | null;
  role?: string;
  mustResetPassword?: boolean;
  isActive?: boolean;
}

export interface CreateDrawingOptions {
  name?: string;
  elements?: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
  preview?: string | null;
  collectionId?: string | null;
}

export interface ListDrawingsOptions {
  search?: string;
  collectionId?: string | null;
  includeData?: boolean;
}

const defaultDrawingPayload = () => ({
  name: `BDD Drawing ${Date.now()}`,
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
  preview: null,
  collectionId: null as string | null,
});

export async function createDrawing(
  request: APIRequestContext,
  overrides: CreateDrawingOptions = {}
): Promise<DrawingRecord> {
  const payload = { ...defaultDrawingPayload(), ...overrides };
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });

  let response = await request.post(`${resolveApiUrl()}/drawings`, {
    headers,
    data: payload,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/drawings`, {
      headers: retryHeaders,
      data: payload,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to create drawing: ${response.status()} ${text}`);
  }
  return (await response.json()) as DrawingRecord;
}

export async function getDrawing(request: APIRequestContext, id: string): Promise<DrawingRecord> {
  const response = await request.get(`${resolveApiUrl()}/drawings/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as DrawingRecord;
}

export async function updateDrawing(
  request: APIRequestContext,
  id: string,
  data: Partial<DrawingRecord>
): Promise<DrawingRecord> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });

  let response = await request.put(`${resolveApiUrl()}/drawings/${id}`, {
    headers,
    data,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, {
      "Content-Type": "application/json",
    });
    response = await request.put(`${resolveApiUrl()}/drawings/${id}`, {
      headers: retryHeaders,
      data,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to update drawing ${id}: ${response.status()} ${text}`);
  }

  return (await response.json()) as DrawingRecord;
}

export async function deleteDrawing(request: APIRequestContext, id: string): Promise<void> {
  const headers = await withCsrfHeaders(request);
  let response = await request.delete(`${resolveApiUrl()}/drawings/${id}`, { headers });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request);
    response = await request.delete(`${resolveApiUrl()}/drawings/${id}`, {
      headers: retryHeaders,
    });
  }

  if (!response.ok() && response.status() !== 404) {
    const text = await response.text();
    throw new Error(`Failed to delete drawing ${id}: ${response.status()} ${text}`);
  }
}

export async function listDrawings(
  request: APIRequestContext,
  options: ListDrawingsOptions = {}
): Promise<DrawingRecord[]> {
  const params = new URLSearchParams();
  if (options.search) params.set("search", options.search);
  if (options.collectionId !== undefined) {
    params.set("collectionId", options.collectionId === null ? "null" : String(options.collectionId));
  }
  if (options.includeData) params.set("includeData", "true");

  const query = params.toString();
  const url = `${resolveApiUrl()}/drawings${query ? `?${query}` : ""}`;
  let response = await request.get(url);

  if (!response.ok()) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    response = await request.get(url);
  }

  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { drawings?: DrawingRecord[] } | DrawingRecord[];
  if (Array.isArray(payload)) return payload;
  return payload.drawings || [];
}

export async function createCollection(request: APIRequestContext, name: string): Promise<CollectionRecord> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/collections`, {
    headers,
    data: { name },
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/collections`, {
      headers: retryHeaders,
      data: { name },
    });
  }

  expect(response.ok()).toBe(true);
  return (await response.json()) as CollectionRecord;
}

export async function listCollections(request: APIRequestContext): Promise<CollectionRecord[]> {
  const response = await request.get(`${resolveApiUrl()}/collections`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as CollectionRecord[];
}

export async function listUsers(request: APIRequestContext): Promise<UserRecord[]> {
  const response = await request.get(`${resolveApiUrl()}/auth/users`);
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { users?: UserRecord[] } | UserRecord[];
  if (Array.isArray(payload)) return payload;
  return payload.users || [];
}

export async function updateUserRole(
  request: APIRequestContext,
  identifier: string,
  role: "ADMIN" | "USER"
): Promise<UserRecord> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/auth/admins`, {
    headers,
    data: { identifier, role },
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/auth/admins`, {
      headers: retryHeaders,
      data: { identifier, role },
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to update user role: ${response.status()} ${text}`);
  }

  const payload = (await response.json()) as { user?: UserRecord } | UserRecord;
  if ("user" in payload && payload.user) return payload.user;
  return payload as UserRecord;
}

export async function deleteCollection(request: APIRequestContext, id: string): Promise<void> {
  const headers = await withCsrfHeaders(request);
  let response = await request.delete(`${resolveApiUrl()}/collections/${id}`, { headers });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request);
    response = await request.delete(`${resolveApiUrl()}/collections/${id}`, {
      headers: retryHeaders,
    });
  }

  if (!response.ok() && response.status() !== 404) {
    const text = await response.text();
    throw new Error(`Failed to delete collection ${id}: ${response.status()} ${text}`);
  }
}

export async function cleanupDrawings(request: APIRequestContext, ids: string[]) {
  for (const id of ids) {
    try {
      await deleteDrawing(request, id);
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function cleanupCollections(request: APIRequestContext, ids: string[]) {
  for (const id of ids) {
    try {
      await deleteCollection(request, id);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ---------------------------------------------------------------------------
// Sharing helpers
// ---------------------------------------------------------------------------

export interface SharingPermission {
  id: string;
  drawingId: string;
  granteeUserId: string;
  permission: "view" | "edit";
  granteeEmail?: string;
  granteeName?: string;
}

export interface LinkShare {
  id: string;
  drawingId: string;
  permission: "view" | "edit";
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt?: string;
}

export interface SharingState {
  permissions: SharingPermission[];
  linkShares: LinkShare[];
}

export interface ResolveUserResult {
  id: string;
  email: string;
  name: string;
  username?: string | null;
}

export async function getDrawingSharing(
  request: APIRequestContext,
  drawingId: string
): Promise<SharingState> {
  const response = await request.get(`${resolveApiUrl()}/drawings/${drawingId}/sharing`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as SharingState;
}

export async function upsertDrawingPermission(
  request: APIRequestContext,
  drawingId: string,
  data: { granteeUserId: string; permission: "view" | "edit" }
): Promise<SharingPermission> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/drawings/${drawingId}/permissions`, {
    headers,
    data,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/drawings/${drawingId}/permissions`, {
      headers: retryHeaders,
      data,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to upsert drawing permission: ${response.status()} ${text}`);
  }
  return (await response.json()) as SharingPermission;
}

export async function revokeDrawingPermission(
  request: APIRequestContext,
  drawingId: string,
  permissionId: string
): Promise<void> {
  const headers = await withCsrfHeaders(request);
  let response = await request.delete(
    `${resolveApiUrl()}/drawings/${drawingId}/permissions/${permissionId}`,
    { headers }
  );

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request);
    response = await request.delete(
      `${resolveApiUrl()}/drawings/${drawingId}/permissions/${permissionId}`,
      { headers: retryHeaders }
    );
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to revoke drawing permission: ${response.status()} ${text}`);
  }
}

export async function createLinkShare(
  request: APIRequestContext,
  drawingId: string,
  data: { permission: "view" | "edit"; expiresAt?: string }
): Promise<LinkShare> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/drawings/${drawingId}/link-shares`, {
    headers,
    data,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/drawings/${drawingId}/link-shares`, {
      headers: retryHeaders,
      data,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to create link share: ${response.status()} ${text}`);
  }
  return (await response.json()) as LinkShare;
}

export async function revokeLinkShare(
  request: APIRequestContext,
  drawingId: string,
  linkShareId: string
): Promise<void> {
  const headers = await withCsrfHeaders(request);
  let response = await request.delete(
    `${resolveApiUrl()}/drawings/${drawingId}/link-shares/${linkShareId}`,
    { headers }
  );

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request);
    response = await request.delete(
      `${resolveApiUrl()}/drawings/${drawingId}/link-shares/${linkShareId}`,
      { headers: retryHeaders }
    );
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to revoke link share: ${response.status()} ${text}`);
  }
}

export async function resolveShareUsers(
  request: APIRequestContext,
  drawingId: string,
  query: string
): Promise<ResolveUserResult[]> {
  const response = await request.get(
    `${resolveApiUrl()}/drawings/${drawingId}/share-resolve?q=${encodeURIComponent(query)}`
  );
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { users?: ResolveUserResult[] } | ResolveUserResult[];
  if (Array.isArray(payload)) return payload;
  return payload.users || [];
}

export async function listSharedDrawings(
  request: APIRequestContext,
  options: ListDrawingsOptions = {}
): Promise<DrawingRecord[]> {
  const params = new URLSearchParams();
  if (options.search) params.set("search", options.search);
  if (options.includeData) params.set("includeData", "true");

  const query = params.toString();
  const url = `${resolveApiUrl()}/drawings/shared${query ? `?${query}` : ""}`;
  const response = await request.get(url);
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { drawings?: DrawingRecord[] } | DrawingRecord[];
  if (Array.isArray(payload)) return payload;
  return payload.drawings || [];
}

// ---------------------------------------------------------------------------
// Admin helpers
// ---------------------------------------------------------------------------

export interface CreateUserOptions {
  email: string;
  password: string;
  name: string;
  username?: string;
  role?: "ADMIN" | "USER";
  mustResetPassword?: boolean;
  isActive?: boolean;
}

export interface PatchUserOptions {
  username?: string;
  name?: string;
  role?: "ADMIN" | "USER";
  mustResetPassword?: boolean;
  isActive?: boolean;
}

export interface RateLimitConfig {
  enabled: boolean;
  windowMs: number;
  max: number;
}

export interface ResetPasswordResult {
  temporaryPassword: string;
}

export async function createUser(
  request: APIRequestContext,
  data: CreateUserOptions
): Promise<UserRecord> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/auth/users`, {
    headers,
    data,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/auth/users`, {
      headers: retryHeaders,
      data,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to create user: ${response.status()} ${text}`);
  }

  const payload = (await response.json()) as { user?: UserRecord } | UserRecord;
  if ("user" in payload && payload.user) return payload.user;
  return payload as UserRecord;
}

export async function patchUser(
  request: APIRequestContext,
  userId: string,
  data: PatchUserOptions
): Promise<UserRecord> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.patch(`${resolveApiUrl()}/auth/users/${userId}`, {
    headers,
    data,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.patch(`${resolveApiUrl()}/auth/users/${userId}`, {
      headers: retryHeaders,
      data,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to patch user ${userId}: ${response.status()} ${text}`);
  }

  const payload = (await response.json()) as { user?: UserRecord } | UserRecord;
  if ("user" in payload && payload.user) return payload.user;
  return payload as UserRecord;
}

export async function resetUserPassword(
  request: APIRequestContext,
  userId: string
): Promise<ResetPasswordResult> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/auth/users/${userId}/reset-password`, {
    headers,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/auth/users/${userId}/reset-password`, {
      headers: retryHeaders,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to reset user password: ${response.status()} ${text}`);
  }

  return (await response.json()) as ResetPasswordResult;
}

export async function toggleRegistration(
  request: APIRequestContext,
  enabled: boolean
): Promise<void> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/auth/registration/toggle`, {
    headers,
    data: { enabled },
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/auth/registration/toggle`, {
      headers: retryHeaders,
      data: { enabled },
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to toggle registration: ${response.status()} ${text}`);
  }
}

export async function getLoginRateLimit(
  request: APIRequestContext
): Promise<RateLimitConfig> {
  const response = await request.get(`${resolveApiUrl()}/auth/rate-limit/login`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as RateLimitConfig;
}

export async function updateLoginRateLimit(
  request: APIRequestContext,
  data: { windowMs: number; max: number }
): Promise<RateLimitConfig> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.put(`${resolveApiUrl()}/auth/rate-limit/login`, {
    headers,
    data,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.put(`${resolveApiUrl()}/auth/rate-limit/login`, {
      headers: retryHeaders,
      data,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to update login rate limit: ${response.status()} ${text}`);
  }

  return (await response.json()) as RateLimitConfig;
}

export async function resetLoginRateLimitCounter(
  request: APIRequestContext,
  identifier: string
): Promise<void> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/auth/rate-limit/login/reset`, {
    headers,
    data: { identifier },
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/auth/rate-limit/login/reset`, {
      headers: retryHeaders,
      data: { identifier },
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to reset login rate limit counter: ${response.status()} ${text}`);
  }
}

export async function startImpersonation(
  request: APIRequestContext,
  targetUserId: string
): Promise<void> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/auth/impersonate`, {
    headers,
    data: { targetUserId },
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/auth/impersonate`, {
      headers: retryHeaders,
      data: { targetUserId },
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to start impersonation: ${response.status()} ${text}`);
  }
}

export async function stopImpersonation(request: APIRequestContext): Promise<void> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/auth/stop-impersonation`, {
    headers,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/auth/stop-impersonation`, {
      headers: retryHeaders,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to stop impersonation: ${response.status()} ${text}`);
  }
}

export async function getImpersonationTargets(
  request: APIRequestContext
): Promise<{ targets: UserRecord[]; actingAdmin?: UserRecord }> {
  const response = await request.get(`${resolveApiUrl()}/auth/impersonation-targets`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as { targets: UserRecord[]; actingAdmin?: UserRecord };
}

// ---------------------------------------------------------------------------
// Profile / account helpers
// ---------------------------------------------------------------------------

export async function updateProfile(
  request: APIRequestContext,
  data: { name: string }
): Promise<void> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.put(`${resolveApiUrl()}/auth/profile`, {
    headers,
    data,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.put(`${resolveApiUrl()}/auth/profile`, {
      headers: retryHeaders,
      data,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to update profile: ${response.status()} ${text}`);
  }
}

export async function changeEmail(
  request: APIRequestContext,
  data: { email: string; currentPassword: string }
): Promise<void> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.put(`${resolveApiUrl()}/auth/email`, {
    headers,
    data,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.put(`${resolveApiUrl()}/auth/email`, {
      headers: retryHeaders,
      data,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to change email: ${response.status()} ${text}`);
  }
}

export async function changePassword(
  request: APIRequestContext,
  data: { currentPassword: string; newPassword: string }
): Promise<void> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  let response = await request.post(`${resolveApiUrl()}/auth/change-password`, {
    headers,
    data,
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, { "Content-Type": "application/json" });
    response = await request.post(`${resolveApiUrl()}/auth/change-password`, {
      headers: retryHeaders,
      data,
    });
  }

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to change password: ${response.status()} ${text}`);
  }
}

export async function getAuthStatus(
  request: APIRequestContext
): Promise<Record<string, unknown>> {
  const response = await request.get(`${resolveApiUrl()}/auth/status`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as Record<string, unknown>;
}

export async function getMe(
  request: APIRequestContext
): Promise<UserRecord> {
  const response = await request.get(`${resolveApiUrl()}/auth/me`);
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { user?: UserRecord } | UserRecord;
  if ("user" in payload && payload.user) return payload.user;
  return payload as UserRecord;
}

export async function loginUser(
  request: APIRequestContext,
  credentials: { email: string; password: string }
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  const response = await request.post(`${resolveApiUrl()}/auth/login`, {
    headers,
    data: credentials,
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok(), status: response.status(), body: body as Record<string, unknown> };
}

export async function logoutUser(request: APIRequestContext): Promise<void> {
  const headers = await withCsrfHeaders(request);
  await request.post(`${resolveApiUrl()}/auth/logout`, { headers });
}

export async function completeMustResetPassword(
  request: APIRequestContext,
  newPassword: string
): Promise<void> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  const response = await request.post(`${resolveApiUrl()}/auth/must-reset-password`, {
    headers,
    data: { newPassword },
  });
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to complete must-reset-password: ${response.status()} ${text}`);
  }
}

// ---------------------------------------------------------------------------
// System helpers
// ---------------------------------------------------------------------------

export interface UpdateCheckResult {
  currentVersion: string;
  channel: string;
  outboundEnabled: boolean;
  latestVersion?: string | null;
  latestUrl?: string | null;
  publishedAt?: string | null;
  isUpdateAvailable?: boolean | null;
}

export async function getUpdateCheck(
  request: APIRequestContext,
  channel: "stable" | "prerelease" = "stable"
): Promise<UpdateCheckResult> {
  const response = await request.get(`${resolveApiUrl()}/system/update?channel=${channel}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as UpdateCheckResult;
}

// ---------------------------------------------------------------------------
// Raw update helper (for version conflict testing)
// ---------------------------------------------------------------------------

export async function updateDrawingRaw(
  request: APIRequestContext,
  id: string,
  data: Record<string, unknown>
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });
  const response = await request.put(`${resolveApiUrl()}/drawings/${id}`, {
    headers,
    data,
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok(), status: response.status(), body: body as Record<string, unknown> };
}
