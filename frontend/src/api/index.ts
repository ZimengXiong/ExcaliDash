import axios from "axios";
import type { Drawing, Collection, DrawingSummary } from "../types";
import { normalizePreviewSvg } from "../utils/previewSvg";

const DEFAULT_DEV_API_URL = "http://localhost:8000/api";
export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? DEFAULT_DEV_API_URL : "/api");

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Re-export axios for type checking
export { default as axios } from 'axios';
export const isAxiosError = axios.isAxiosError;

// Export api instance for direct use
export { api as default };

// Auth state persisted in local storage should remain non-sensitive.
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

// CSRF Token Management
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

  // Prevent multiple simultaneous token fetches
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

export const authRefresh = async (
  refreshToken?: string
): Promise<{ accessToken: string; refreshToken?: string }> => {
  const body =
    typeof refreshToken === "string" && refreshToken.trim().length > 0
      ? { refreshToken }
      : {};
  const response = await axios.post<{ accessToken: string; refreshToken?: string }>(
    `${API_URL}/auth/refresh`,
    body,
    { withCredentials: true }
  );
  return response.data;
};

export const authLogout = async (): Promise<void> => {
  await api.post("/auth/logout");
};

export const authLogin = async (
  email: string,
  password: string
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> => {
  const response = await axios.post<{ user: AuthUser; accessToken: string; refreshToken: string }>(
    `${API_URL}/auth/login`,
    { email, password },
    { withCredentials: true }
  );
  return response.data;
};

export const authRegister = async (
  email: string,
  password: string,
  name: string
): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> => {
  const response = await api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>(
    "/auth/register",
    { email, password, name }
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
  try {
    const status = await authStatus();
    if (status?.oidcEnforced) {
      startOidcSignIn();
      return;
    }
  } catch {
    // Best-effort status probe; fall through to legacy behavior.
  }

  const authEnabled = await getAuthEnabledStatus();
  if (authEnabled === false) return;
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = async (): Promise<string> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshResponse = await authRefresh();

      const nextAccessToken = String(refreshResponse.accessToken || "");
      if (!nextAccessToken) {
        throw new Error("Missing access token in refresh response");
      }

      return nextAccessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

// Add request interceptor to include JWT and CSRF tokens
api.interceptors.request.use(
  async (config) => {
    // Auth endpoints that don't require authentication (login, register, etc.)
    const publicAuthEndpoints = [
      '/auth/login',
      '/auth/refresh',
      '/auth/password-reset-request',
      '/auth/password-reset-confirm',
    ];

    const isPublicAuthEndpoint = config.url && publicAuthEndpoints.some(endpoint => config.url?.startsWith(endpoint));

    // Only add CSRF token for state-changing methods (except public auth endpoints)
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

// Add response interceptor to handle auth and CSRF token errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Handle must-reset-password enforcement (403)
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

    // Handle 401 Unauthorized (invalid/expired JWT)
    if (error.response?.status === 401) {
      const originalRequest = (error.config || {}) as RetriableRequestConfig;
      const url = String(originalRequest.url || "");
      const isAuthRoute = url.includes('/auth/');
      const authEnabled = !isAuthRoute ? await getAuthEnabledStatus() : true;

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
          await redirectToLogin();
          return Promise.reject(error);
        }
      }

      if (!isAuthRoute) {
        clearStoredAuth();
        await redirectToLogin();
      }
    }

    // If we get a 403 with CSRF error, clear token and retry once
    if (
      error.response?.status === 403 &&
      error.response?.data?.error?.includes("CSRF")
    ) {
      clearCsrfToken();

      // Retry the request once with a fresh token
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
export type ShareLinkRole = "viewer" | "editor";

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

export const getSharedDrawings = async (options?: {
  search?: string;
  includeData?: boolean;
  limit?: number;
  offset?: number;
  sortField?: DrawingSortField;
  sortDirection?: SortDirection;
}) => {
  const params: Record<string, string | number> = {};
  if (options?.search) params.search = options.search;
  if (options?.includeData) params.includeData = "true";
  if (options?.limit !== undefined) params.limit = options.limit;
  if (options?.offset !== undefined) params.offset = options.offset;
  if (options?.sortField) params.sortField = options.sortField;
  if (options?.sortDirection) params.sortDirection = options.sortDirection;

  if (options?.includeData) {
    const response = await api.get<PaginatedDrawings<Drawing>>("/drawings/shared", { params });
    return {
      ...response.data,
      drawings: response.data.drawings.map(deserializeDrawing),
    };
  }

  const response = await api.get<PaginatedDrawings<DrawingSummary>>("/drawings/shared", { params });
  return {
    ...response.data,
    drawings: response.data.drawings.map(deserializeDrawingSummary),
  };
};

export const getDrawing = async (
  id: string,
  options?: { shareToken?: string }
) => {
  const headers: Record<string, string> = {};
  if (options?.shareToken) {
    headers["x-share-token"] = options.shareToken;
  }
  const response = await api.get<Drawing>(`/drawings/${id}`, { headers });
  return deserializeDrawing(response.data);
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

export const updateDrawingPreview = async (
  id: string,
  preview: string | null
): Promise<{ success: true }> => {
  const response = await api.put<{ success: true }>(`/drawings/${id}/preview`, { preview });
  return response.data;
};

export const getDrawingSceneMeta = async (id: string): Promise<{
  drawingId: string;
  seq: number;
  dbVersion: number;
  updatedAt: string | number;
}> => {
  const response = await api.get<{
    drawingId: string;
    seq: number;
    dbVersion: number;
    updatedAt: string | number;
  }>(`/drawings/${id}/scene-meta`);
  return response.data;
};

export const flushDrawingScene = async (id: string): Promise<{
  success: true;
  drawingId: string;
  seq: number | null;
  dbVersion: number | null;
}> => {
  const response = await api.post<{
    success: true;
    drawingId: string;
    seq: number | null;
    dbVersion: number | null;
  }>(`/drawings/${id}/flush`);
  return response.data;
};

export const deleteDrawing = async (id: string) => {
  const response = await api.delete<{ success: true }>(`/drawings/${id}`);
  return response.data;
};

export const duplicateDrawing = async (id: string) => {
  const response = await api.post<Drawing>(`/drawings/${id}/duplicate`);
  return deserializeDrawing(response.data);
};

export const getDrawingShareLinks = async (
  id: string
): Promise<{ drawingId: string; viewerToken: string; editorToken: string }> => {
  const response = await api.get<{ drawingId: string; viewerToken: string; editorToken: string }>(`/drawings/${id}/share-links`);
  return response.data;
};

export const rotateDrawingShareLink = async (
  id: string,
  role: ShareLinkRole
): Promise<{ role: ShareLinkRole; drawingId: string; token: string }> => {
  const response = await api.post<{ role: ShareLinkRole; drawingId: string; token: string }>(
    `/drawings/${id}/share-links/${role}/rotate`
  );
  return response.data;
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

// --- Library ---

// Library items are Excalidraw library items - dynamic structure from Excalidraw
type LibraryItem = Record<string, unknown>;

export const getLibrary = async (): Promise<LibraryItem[]> => {
  const response = await api.get<{ items: LibraryItem[] }>("/library");
  return response.data.items;
};

export const updateLibrary = async (items: LibraryItem[]): Promise<LibraryItem[]> => {
  const response = await api.put<{ items: LibraryItem[] }>("/library", { items });
  return response.data.items;
};
