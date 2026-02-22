import type { APIRequestContext } from "@playwright/test";
import { getCsrfHeaders } from "./api-helpers";

const AUTH_EMAIL = process.env.AUTH_EMAIL || "admin@example.com";
const AUTH_USERNAME = process.env.AUTH_USERNAME || "admin";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "BddPassword!123";

const resolveApiUrl = (_request: APIRequestContext) =>
  (process.env.API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

type AuthStatus = {
  enabled: boolean;
  authenticated: boolean;
  bootstrapRequired?: boolean;
  authOnboardingRequired?: boolean;
  user?: { mustResetPassword?: boolean } | null;
};

const fetchAuthStatus = async (request: APIRequestContext): Promise<AuthStatus> => {
  const response = await request.get(`${resolveApiUrl(request)}/auth/status`);
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to fetch auth status: ${response.status()} ${text}`);
  }
  return (await response.json()) as AuthStatus;
};

const normalizeUser = (user: AuthStatus["user"]): AuthStatus["user"] => {
  if (user) return user;
  return { mustResetPassword: false };
};

const postWithCsrf = async (
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>
) =>
  request.post(`${resolveApiUrl(request)}${path}`, {
    headers: {
      origin: process.env.BASE_URL || "http://127.0.0.1:5173",
      "Content-Type": "application/json",
      ...(await getCsrfHeaders(request)),
    },
    data,
  });

export const ensureApiAuthenticated = async (request: APIRequestContext) => {
  let status = await fetchAuthStatus(request);
  if (!status.enabled) return;

  const resetIfRequired = async () => {
    if (!status.user?.mustResetPassword) return;

    const response = await postWithCsrf(request, "/auth/must-reset-password", {
      newPassword: AUTH_PASSWORD,
    });

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(`Failed to reset admin password: ${response.status()} ${text}`);
    }
  };

  const ensureAuthEnabled = async () => {
    if (!status.authOnboardingRequired) return;

    const response = await postWithCsrf(request, "/auth/onboarding-choice", {
      enableAuth: true,
    });

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(`Failed to enable authentication: ${response.status()} ${text}`);
    }

    status = await fetchAuthStatus(request);
  };

  const attemptLogin = async () => {
    const payload = AUTH_EMAIL
      ? { email: AUTH_EMAIL, password: AUTH_PASSWORD }
      : { username: AUTH_USERNAME, password: AUTH_PASSWORD };
    const response = await postWithCsrf(request, "/auth/login", payload);

    if (response.ok()) {
      status = await fetchAuthStatus(request);
      status.user = normalizeUser(status.user);
      await resetIfRequired();
      return true;
    }

    return response;
  };

  await ensureAuthEnabled();

  if (!status.enabled) {
    throw new Error("Authentication is disabled; cannot run authenticated scenarios");
  }

  if (status.authenticated) {
    status.user = normalizeUser(status.user);
    await resetIfRequired();
    return;
  }

  const loginResult = await attemptLogin();
  if (loginResult === true) return;

  if (loginResult.status() === 429) {
    const retry = await attemptLogin();
    if (retry === true) return;
    const text = await retry.text();
    throw new Error(`Failed to login admin: ${retry.status()} ${text}`);
  }

  const text = await loginResult.text();
  throw new Error(`Failed to login admin: ${loginResult.status()} ${text}`);
};
