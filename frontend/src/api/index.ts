import axios from "axios";
import type { Drawing, Collection, DrawingSummary } from "../types";
import { normalizePreviewSvg } from "../utils/previewSvg";

export const API_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export { default as axios } from 'axios';
export const isAxiosError = axios.isAxiosError;

export { api as default };

export type UpdateChannel = "stable" | "prerelease";

export type UpdateInfo = {
  currentVersion: string | null;
  channel: UpdateChannel;
  outboundEnabled: boolean;
  latestVersion: string | null;
  latestUrl: string | null;
  publishedAt: string | null;
  isUpdateAvailable: boolean | null;
  error?: string;
};

export const getUpdateInfo = async (channel: UpdateChannel): Promise<UpdateInfo> => {
  const response = await api.get<UpdateInfo>("/system/update", { params: { channel } });
  return response.data;
};

const USER_KEY = 'excalidash-user';
const AUTH_ENABLED_CACHE_KEY = "excalidash-auth-enabled";
const AUTH_STATUS_TTL_MS = 5000;

type RetriableRequestConfig = {
  _retry?: boolean;
  _csrfRetry?: boolean;
  _authModeRetry?: boolean;
  url?: string;
  headers?: Record<string, string>;
};

let authEnabledProbeCache: { value: boolean; fetchedAt: number } | null = null;

let csrfToken: string | null = null;
let csrfHeaderName: string = "x-csrf-token";
let csrfTokenPromise: Promise<void> | null = null;

export const fetchCsrfToken = async (): Promise<void> => {
  try {
    const response = await axios.get<{ token: string; header: string }>(
      `${API_URL}/csrf-token`,
      { withCredentials: true }
    );
    csrfToken = response.data.token;
    csrfHeaderName = response.data.header || "x-csrf-token";
  } catch (error) {
    console.error("Failed to fetch CSRF token:", error);
    throw error;
  }
};

const ensureCsrfToken = async (): Promise<void> => {
  if (csrfToken) return;

  if (!csrfTokenPromise) {
    csrfTokenPromise = fetchCsrfToken().finally(() => {
      csrfTokenPromise = null;
    });
  }
  await csrfTokenPromise;
};

export const clearCsrfToken = (): void => {
  csrfToken = null;
};

export interface AuthStatusResponse {
  authEnabled?: boolean;
  enabled?: boolean;
  authMode?: "local" | "hybrid" | "oidc_enforced";
  oidcEnabled?: boolean;
  oidcEnforced?: boolean;
  oidcProvider?: string;
  oidcJitProvisioningEnabled?: boolean;
  bootstrapRequired?: boolean;
  authOnboardingRequired?: boolean;
  authOnboardingMode?: "migration" | "fresh";
  authOnboardingRecommended?: "enable" | null;
}

export interface AuthUser {
  id: string;
  username?: string | null;
  email: string;
  name: string;
  role?: string;
  mustResetPassword?: boolean;
}

export const authStatus = async (): Promise<AuthStatusResponse> => {
  const response = await axios.get<AuthStatusResponse>(
    `${API_URL}/auth/status`,
    { withCredentials: true }
  );
  return response.data;
};

export const startOidcSignIn = (returnTo?: string): void => {
  const fallbackPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const requestedPath = typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : fallbackPath;
  const safeReturnTo = requestedPath.startsWith("/") ? requestedPath : "/";
  window.location.href = `/api/auth/oidc/start?returnTo=${encodeURIComponent(safeReturnTo)}`;
};

export const authMe = async (): Promise<{ user: AuthUser }> => {
  const response = await axios.get<{ user: AuthUser }>(`${API_URL}/auth/me`, {
    withCredentials: true,
  });
  return response.data;
};

export const authRefresh = async (): Promise<void> => {
  await api.post<{ ok?: boolean }>("/auth/refresh", {});
};

export const authLogout = async (): Promise<void> => {
  await api.post("/auth/logout");
};

export const authLogin = async (
  email: string,
  password: string
): Promise<{ user: AuthUser }> => {
  const response = await api.post<{ user: AuthUser }>('/auth/login', { email, password });
  return response.data;
};

export const authRegister = async (
  email: string,
  password: string,
  name: string,
  setupCode?: string
): Promise<{ user: AuthUser }> => {
  const payload: { email: string; password: string; name: string; setupCode?: string } = {
    email,
    password,
    name,
  };
  if (typeof setupCode === "string" && setupCode.trim().length > 0) {
    payload.setupCode = setupCode.trim();
  }
  const response = await api.post<{ user: AuthUser }>(
    "/auth/register",
    payload
  );
  return response.data;
};

export const authOnboardingChoice = async (
  enableAuth: boolean
): Promise<{ authEnabled: boolean; authOnboardingCompleted: boolean; bootstrapRequired: boolean }> => {
  const response = await api.post<{
    authEnabled: boolean;
    authOnboardingCompleted: boolean;
    bootstrapRequired: boolean;
  }>('/auth/onboarding-choice', { enableAuth });
  return response.data;
};

export const authPasswordResetConfirm = async (
  token: string,
  password: string
): Promise<void> => {
  await axios.post(
    `${API_URL}/auth/password-reset-confirm`,
    { token, password },
    { withCredentials: true }
  );
};

const clearStoredAuth = () => {
  localStorage.removeItem(USER_KEY);
};

const readCachedAuthEnabled = (): boolean | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_ENABLED_CACHE_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
};

const cacheAuthEnabled = (enabled: boolean) => {
  if (typeof window === "undefined") return;
  authEnabledProbeCache = { value: enabled, fetchedAt: Date.now() };
  localStorage.setItem(AUTH_ENABLED_CACHE_KEY, String(enabled));
};

const getAuthEnabledStatus = async (): Promise<boolean | null> => {
  const now = Date.now();
  if (authEnabledProbeCache && now - authEnabledProbeCache.fetchedAt < AUTH_STATUS_TTL_MS) {
    return authEnabledProbeCache.value;
  }

  try {
    const response = await authStatus();
    const enabled =
      typeof response?.authEnabled === "boolean"
        ? response.authEnabled
        : typeof response?.enabled === "boolean"
          ? response.enabled
          : true;
    cacheAuthEnabled(enabled);
    return enabled;
  } catch {
    return readCachedAuthEnabled();
  }
};

const redirectToLogin = async () => {
  const isShareFlow =
    window.location.pathname.startsWith("/shared/");
  if (isShareFlow) return;

  try {
    const status = await authStatus();
    if (status?.oidcEnforced) {
      startOidcSignIn();
      return;
    }
  } catch {
    // If auth status can't be fetched, fall back to cached or default authEnabled behavior.
  }

  const authEnabled = await getAuthEnabledStatus();
  if (authEnabled === false) return;
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

let refreshPromise: Promise<void> | null = null;

const refreshAccessToken = async (): Promise<void> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      await authRefresh();
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

api.interceptors.request.use(
  async (config) => {
    const publicAuthEndpoints = [
      '/auth/password-reset-request',
      '/auth/password-reset-confirm',
    ];

    const isPublicAuthEndpoint = config.url && publicAuthEndpoints.some(endpoint => config.url?.startsWith(endpoint));

    const method = config.method?.toUpperCase();
    if (method && ["POST", "PUT", "DELETE", "PATCH"].includes(method) && !isPublicAuthEndpoint) {
      await ensureCsrfToken();
      if (csrfToken) {
        config.headers[csrfHeaderName] = csrfToken;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === "MUST_RESET_PASSWORD"
    ) {
      const url = String(error.config?.url || "");
      const isAuthRoute =
        url.startsWith("/auth/me") ||
        url.startsWith("/auth/must-reset-password") ||
        url.startsWith("/auth/login") ||
        url.startsWith("/auth/register");

      if (!isAuthRoute && window.location.pathname !== "/login") {
        window.location.href = "/login?mustReset=1";
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      const originalRequest = (error.config || {}) as RetriableRequestConfig;
      const url = String(originalRequest.url || "");
      const isAuthRoute = url.includes('/auth/');
      const isShareFlow =
        window.location.pathname.startsWith("/shared/");
      const authEnabled = !isAuthRoute ? await getAuthEnabledStatus() : true;

      // Share links can grant access to drawings without a logged-in user session.
      // In that flow, attempting refresh-token rotation on unrelated 401s (e.g. /library)
      // just adds latency and extra failed requests.
      if (isShareFlow && !isAuthRoute) {
        return Promise.reject(error);
      }

      if (!isAuthRoute && authEnabled === false) {
        if (!originalRequest._authModeRetry) {
          originalRequest._authModeRetry = true;
          return api(originalRequest as any);
        }
        return Promise.reject(error);
      }

      if (!isAuthRoute && !originalRequest._retry) {
        try {
          originalRequest._retry = true;
          await refreshAccessToken();
          return api(originalRequest as any);
        } catch {
          clearStoredAuth();
          if (!isShareFlow) {
            await redirectToLogin();
          }
          return Promise.reject(error);
        }
      }

      if (!isAuthRoute) {
        clearStoredAuth();
        if (!isShareFlow) {
          await redirectToLogin();
        }
      }
    }

    if (
      error.response?.status === 403 &&
      error.response?.data?.error?.includes("CSRF")
    ) {
      clearCsrfToken();

      const originalRequest = (error.config || {}) as RetriableRequestConfig;
      if (!originalRequest._csrfRetry) {
        originalRequest._csrfRetry = true;
        await fetchCsrfToken();
        if (csrfToken) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers[csrfHeaderName] = csrfToken;
        }
        return api(originalRequest as any);
      }
    }
    return Promise.reject(error);
  }
);

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
  data: T
): T & { createdAt: number; updatedAt: number } => ({
  ...data,
  createdAt: coerceTimestamp(data.createdAt),
  updatedAt: coerceTimestamp(data.updatedAt),
});

const deserializeDrawingSummary = (drawing: unknown): DrawingSummary => {
  if (typeof drawing !== 'object' || drawing === null) {
    throw new Error('Invalid drawing data');
  }
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
  if (typeof drawing !== 'object' || drawing === null) {
    throw new Error('Invalid drawing data');
  }
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

export function getDrawings(
  search?: string,
  collectionId?: string | null,
  options?: {
    limit?: number;
    offset?: number;
    sortField?: DrawingSortField;
    sortDirection?: SortDirection;
  }
): Promise<PaginatedDrawings<DrawingSummary>>;

export function getDrawings(
  search: string | undefined,
  collectionId: string | null | undefined,
  options: {
    includeData: true;
    limit?: number;
    offset?: number;
    sortField?: DrawingSortField;
    sortDirection?: SortDirection;
  }
): Promise<PaginatedDrawings<Drawing>>;

export async function getDrawings(
  search?: string,
  collectionId?: string | null,
  options?: {
    includeData?: boolean;
    limit?: number;
    offset?: number;
    sortField?: DrawingSortField;
    sortDirection?: SortDirection;
  }
) {
  const params: Record<string, string | number> = {};
  if (search) params.search = search;
  if (collectionId !== undefined)
    params.collectionId = collectionId === null ? "null" : collectionId;
  if (options?.limit !== undefined) params.limit = options.limit;
  if (options?.offset !== undefined) params.offset = options.offset;
  if (options?.sortField) params.sortField = options.sortField;
  if (options?.sortDirection) params.sortDirection = options.sortDirection;

  if (options?.includeData) {
    params.includeData = "true";
    const response = await api.get<PaginatedDrawings<Drawing>>("/drawings", { params });
    return {
      ...response.data,
      drawings: response.data.drawings.map(deserializeDrawing)
    };
  }
  const response = await api.get<PaginatedDrawings<DrawingSummary>>("/drawings", { params });
  return {
    ...response.data,
    drawings: response.data.drawings.map(deserializeDrawingSummary)
  };
}

export async function getSharedDrawings(
  search?: string,
  options?: {
    limit?: number;
    offset?: number;
    sortField?: DrawingSortField;
    sortDirection?: SortDirection;
  }
): Promise<PaginatedDrawings<DrawingSummary>> {
  const params: Record<string, string | number> = {};
  if (search) params.search = search;
  if (options?.limit !== undefined) params.limit = options.limit;
  if (options?.offset !== undefined) params.offset = options.offset;
  if (options?.sortField) params.sortField = options.sortField;
  if (options?.sortDirection) params.sortDirection = options.sortDirection;
  const response = await api.get<PaginatedDrawings<DrawingSummary>>("/drawings/shared", { params });
  return {
    ...response.data,
    drawings: response.data.drawings.map(deserializeDrawingSummary),
  };
}

export const getDrawing = async (id: string) => {
  const response = await api.get<Drawing>(`/drawings/${id}`);
  return deserializeDrawing(response.data);
};

export type ShareResolvedUser = { id: string; name: string; email: string };

export const resolveShareUsers = async (drawingId: string, q: string): Promise<ShareResolvedUser[]> => {
  const response = await api.get<{ users: ShareResolvedUser[] }>(`/drawings/${drawingId}/share-resolve`, {
    params: { q },
  });
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

export const getDrawingSharing = async (drawingId: string): Promise<{
  permissions: DrawingPermissionRow[];
  linkShares: DrawingLinkShareRow[];
}> => {
  const response = await api.get<{ permissions: DrawingPermissionRow[]; linkShares: DrawingLinkShareRow[] }>(
    `/drawings/${drawingId}/sharing`
  );
  return response.data;
};

export const upsertDrawingPermission = async (
  drawingId: string,
  params: { granteeUserId: string; permission: "view" | "edit" }
): Promise<{ permission: DrawingPermissionRow }> => {
  const response = await api.post<{ permission: DrawingPermissionRow }>(`/drawings/${drawingId}/permissions`, params);
  return response.data;
};

export const revokeDrawingPermission = async (drawingId: string, permissionId: string): Promise<{ success: true }> => {
  const response = await api.delete<{ success: true }>(`/drawings/${drawingId}/permissions/${permissionId}`);
  return response.data;
};

export const createLinkShare = async (
  drawingId: string,
  params: { permission: "view" | "edit"; expiresAt?: string; passphrase?: string }
): Promise<{ share: DrawingLinkShareRow }> => {
  const response = await api.post<{ share: DrawingLinkShareRow }>(
    `/drawings/${drawingId}/link-shares`,
    params
  );
  return response.data;
};

export const revokeLinkShare = async (drawingId: string, shareId: string): Promise<{ success: true }> => {
  const response = await api.delete<{ success: true }>(`/drawings/${drawingId}/link-shares/${shareId}`);
  return response.data;
};

export const createDrawing = async (
  name?: string,
  collectionId?: string | null
) => {
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

export const getCollections = async () => {
  const response = await api.get<Collection[]>("/collections");
  return response.data;
};

export const createCollection = async (name: string) => {
  const response = await api.post<Collection>("/collections", { name });
  return response.data;
};

export const updateCollection = async (id: string, name: string) => {
  const response = await api.put<{ success: true }>(`/collections/${id}`, {
    name,
  });
  return response.data;
};

export const deleteCollection = async (id: string) => {
  const response = await api.delete<{ success: true }>(`/collections/${id}`);
  return response.data;
};


type LibraryItem = Record<string, unknown>;

export const getLibrary = async (): Promise<LibraryItem[]> => {
  const response = await api.get<{ items: LibraryItem[] }>("/library");
  return response.data.items;
};

export const updateLibrary = async (items: LibraryItem[]): Promise<LibraryItem[]> => {
  const response = await api.put<{ items: LibraryItem[] }>("/library", { items });
  return response.data.items;
};
