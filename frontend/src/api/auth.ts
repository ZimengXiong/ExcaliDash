import { cachePasswordPolicy, type PasswordPolicyResponse } from "../utils/passwordPolicy";
import { API_URL, api, axios } from "./client";
import type { DrawingSortField, SortDirection } from "./drawings";

const USER_KEY = "excalidash-user";
const AUTH_ENABLED_CACHE_KEY = "excalidash-auth-enabled";
const AUTH_STATUS_TTL_MS = 5000;

const publicAuthEndpoints = [
  "/auth/password-reset-request",
  "/auth/password-reset-confirm",
];

type RetriableRequestConfig = {
  _retry?: boolean;
  _csrfRetry?: boolean;
  _authModeRetry?: boolean;
  url?: string;
  headers?: Record<string, string>;
};

let authEnabledProbeCache: { value: boolean; fetchedAt: number } | null = null;
let csrfToken: string | null = null;
let csrfHeaderName = "x-csrf-token";
let csrfTokenPromise: Promise<void> | null = null;
let refreshPromise: Promise<void> | null = null;

export interface AuthStatusResponse {
  authEnabled?: boolean;
  enabled?: boolean;
  registrationEnabled?: boolean;
  authMode?: "local" | "hybrid" | "oidc_enforced";
  oidcEnabled?: boolean;
  oidcEnforced?: boolean;
  oidcProvider?: string;
  oidcJitProvisioningEnabled?: boolean;
  bootstrapRequired?: boolean;
  authOnboardingRequired?: boolean;
  authOnboardingMode?: "migration" | "fresh";
  authOnboardingRecommended?: "enable" | null;
  passwordPolicy?: PasswordPolicyResponse;
}

export interface AuthUser {
  id: string;
  username?: string | null;
  email: string;
  name: string;
  role?: string;
  mustResetPassword?: boolean;
}

export interface UserPreferences {
  theme?: "light" | "dark";
  dashboardSortField?: DrawingSortField;
  dashboardSortDirection?: SortDirection;
  language?: string;
  gridStep?: number;
}

export interface ApiKeyMetadata {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKeyMetadata;
  token: string;
}

export const API_KEY_SCOPES = [
  "drawings:read",
  "drawings:write",
  "collections:read",
  "collections:write",
] as const;

export const fetchCsrfToken = async (): Promise<void> => {
  const response = await axios.get<{ token: string; header: string }>(
    `${API_URL}/csrf-token`,
    { withCredentials: true },
  );
  csrfToken = response.data.token;
  csrfHeaderName = response.data.header || "x-csrf-token";
};

export const clearCsrfToken = (): void => {
  csrfToken = null;
};

// Exposes the current CSRF header/token so keepalive/sendBeacon saves fired
// during pagehide (where the axios interceptor pipeline can't run) can still
// satisfy the CSRF middleware.
export const getCsrfHeader = (): { name: string; token: string } | null => {
  if (!csrfToken) return null;
  return { name: csrfHeaderName, token: csrfToken };
};

export const authStatus = async (): Promise<AuthStatusResponse> => {
  const response = await axios.get<AuthStatusResponse>(`${API_URL}/auth/status`, {
    withCredentials: true,
  });
  cachePasswordPolicy(response.data.passwordPolicy);
  return response.data;
};

export const startOidcSignIn = (returnTo?: string): void => {
  const fallbackPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const requestedPath =
    typeof returnTo === "string" && returnTo.startsWith("/")
      ? returnTo
      : fallbackPath;
  const safeReturnTo = requestedPath.startsWith("/") ? requestedPath : "/";
  window.location.href = `/api/auth/oidc/start?returnTo=${encodeURIComponent(safeReturnTo)}`;
};

export const authMe = async (): Promise<{ user: AuthUser }> => {
  const response = await axios.get<{ user: AuthUser }>(`${API_URL}/auth/me`, {
    withCredentials: true,
  });
  return response.data;
};

export const getUserPreferences = async (): Promise<UserPreferences> => {
  const response = await api.get<{ preferences: UserPreferences }>("/auth/preferences");
  return response.data.preferences ?? {};
};

export const updateUserPreferences = async (
  preferences: Partial<UserPreferences>,
): Promise<UserPreferences> => {
  const response = await api.put<{ preferences: UserPreferences }>(
    "/auth/preferences",
    preferences,
  );
  return response.data.preferences ?? {};
};

export const authRefresh = async (): Promise<void> => {
  await api.post<{ ok?: boolean }>("/auth/refresh", {});
};

export const authLogout = async (): Promise<void> => {
  await api.post("/auth/logout");
};

export const authLogin = async (
  email: string,
  password: string,
): Promise<{ user: AuthUser }> => {
  const response = await api.post<{ user: AuthUser }>("/auth/login", {
    email,
    password,
  });
  return response.data;
};

export const authRegister = async (
  email: string,
  password: string,
  name: string,
  setupCode?: string,
): Promise<{ user: AuthUser }> => {
  const payload: { email: string; password: string; name: string; setupCode?: string } = {
    email,
    password,
    name,
  };
  if (typeof setupCode === "string" && setupCode.trim().length > 0) {
    payload.setupCode = setupCode.trim();
  }
  const response = await api.post<{ user: AuthUser }>("/auth/register", payload);
  return response.data;
};

export const listApiKeys = async (): Promise<ApiKeyMetadata[]> => {
  const response = await api.get<{ apiKeys: ApiKeyMetadata[] }>("/auth/api-keys");
  return response.data.apiKeys;
};

export const createApiKey = async (
  name: string,
  scopes?: string[],
): Promise<CreateApiKeyResponse> => {
  const response = await api.post<CreateApiKeyResponse>("/auth/api-keys", { name, scopes });
  return response.data;
};

export const revokeApiKey = async (id: string): Promise<void> => {
  await api.delete(`/auth/api-keys/${id}`);
};

export const authOnboardingChoice = async (
  enableAuth: boolean,
): Promise<{
  authEnabled: boolean;
  authOnboardingCompleted: boolean;
  bootstrapRequired: boolean;
}> => {
  const response = await api.post<{
    authEnabled: boolean;
    authOnboardingCompleted: boolean;
    bootstrapRequired: boolean;
  }>("/auth/onboarding-choice", { enableAuth });
  return response.data;
};

export const authPasswordResetConfirm = async (
  token: string,
  password: string,
): Promise<void> => {
  await axios.post(
    `${API_URL}/auth/password-reset-confirm`,
    { token, password },
    { withCredentials: true },
  );
};

const clearStoredAuth = () => {
  localStorage.removeItem(USER_KEY);
};

export const ensureCsrfToken = async (): Promise<void> => {
  if (csrfToken) return;
  csrfTokenPromise ||= fetchCsrfToken().finally(() => {
    csrfTokenPromise = null;
  });
  await csrfTokenPromise;
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
  const isShareFlow = window.location.pathname.startsWith("/shared/");
  if (isShareFlow) return;

  try {
    const status = await authStatus();
    if (status?.oidcEnforced) {
      startOidcSignIn();
      return;
    }
  } catch {
    // Fallback to cached/default authEnabled behavior below.
  }

  const authEnabled = await getAuthEnabledStatus();
  if (authEnabled === false) return;
  if (window.location.pathname !== "/login") window.location.href = "/login";
};

const refreshAccessToken = async (): Promise<void> => {
  refreshPromise ||= authRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};

const isPublicAuthEndpoint = (url?: string): boolean =>
  Boolean(url && publicAuthEndpoints.some((endpoint) => url.startsWith(endpoint)));

api.interceptors.request.use(
  async (config) => {
    const method = config.method?.toUpperCase();
    if (
      method &&
      ["POST", "PUT", "DELETE", "PATCH"].includes(method) &&
      !isPublicAuthEndpoint(config.url)
    ) {
      await ensureCsrfToken();
      if (csrfToken) config.headers[csrfHeaderName] = csrfToken;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 403 && error.response?.data?.code === "MUST_RESET_PASSWORD") {
      const url = String(error.config?.url || "");
      const isAuthRoute = [
        "/auth/me",
        "/auth/must-reset-password",
        "/auth/login",
        "/auth/register",
      ].some((route) => url.startsWith(route));
      if (!isAuthRoute && window.location.pathname !== "/login") {
        window.location.href = "/login?mustReset=1";
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      const originalRequest = (error.config || {}) as RetriableRequestConfig;
      const url = String(originalRequest.url || "");
      const isAuthRoute = url.includes("/auth/");
      const isShareFlow = window.location.pathname.startsWith("/shared/");
      const authEnabled = !isAuthRoute ? await getAuthEnabledStatus() : true;

      if (isShareFlow && !isAuthRoute) return Promise.reject(error);
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
          if (!isShareFlow) await redirectToLogin();
          return Promise.reject(error);
        }
      }

      if (!isAuthRoute) {
        clearStoredAuth();
        if (!isShareFlow) await redirectToLogin();
      }
    }

    if (error.response?.status === 403 && error.response?.data?.error?.includes("CSRF")) {
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
  },
);
