import express, { Request, Response } from "express";
import { PrismaClient } from "../generated/client";
import { generators } from "openid-client";
import { createOidcClientFactory } from "./oidcClient";
import { registerOidcCallbackRoute } from "./oidcCallbackRoute";
import { getOidcErrorMessage, encodeFlowPayload, OIDC_FLOW_COOKIE_NAME, OIDC_FLOW_TTL_MS, OidcFlowPayload, requestUsesHttps, sanitizeReturnTo } from "./oidcRouteHelpers";

export type RegisterOidcRoutesDeps = {
  router: express.Router;
  prisma: PrismaClient;
  ensureAuthEnabled: (res: Response) => Promise<boolean>;
  ensureSystemConfig: () => Promise<{
    id: string;
    oidcJitProvisioningEnabled: boolean | null;
  }>;
  sanitizeText: (input: unknown, maxLength?: number) => string;
  generateTokens: (
    userId: string,
    email: string,
    options?: {
      impersonatorId?: string;
      authProvider?: "local" | "oidc";
      oidcGroups?: string[];
    },
  ) => { accessToken: string; refreshToken: string };
  setAuthCookies: (
    req: Request,
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) => void;
  getRefreshTokenExpiresAt: () => Date;
  isMissingRefreshTokenTableError: (error: unknown) => boolean;
  config: {
    authMode: "local" | "hybrid" | "oidc_enforced" | "disabled";
    jwtSecret: string;
    enableRefreshTokenRotation: boolean;
    enableAuditLogging: boolean;
    oidc: {
      enabled: boolean;
      enforced: boolean;
      providerName: string;
      issuerUrl: string | null;
      discoveryUrl: string | null;
      clientId: string | null;
      clientSecret: string | null;
      redirectUri: string | null;
      idTokenSignedResponseAlg: string | null;
      tokenEndpointAuthMethod:
        | "none"
        | "client_secret_basic"
        | "client_secret_post"
        | null;
      scopes: string;
      emailClaim: string;
      emailVerifiedClaim: string;
      groupsClaim: string;
      adminGroups: string[];
      requireEmailVerified: boolean;
      jitProvisioning: boolean;
      firstUserAdmin: boolean;
    };
  };
};

export const registerOidcRoutes = (deps: RegisterOidcRoutesDeps) => {
  const { router, ensureAuthEnabled, config } = deps;
  if (!config.oidc.enabled) {
    return;
  }
  const { buildOidcClient, getOidcClient } = createOidcClientFactory(config);
  const clearOidcFlowCookie = (req: Request, res: Response) => {
    res.clearCookie(OIDC_FLOW_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUsesHttps(req),
      path: "/",
    });
  };
  const setOidcFlowCookie = (
    req: Request,
    res: Response,
    payload: OidcFlowPayload,
  ) => {
    const encoded = encodeFlowPayload(payload, config.jwtSecret);
    res.cookie(OIDC_FLOW_COOKIE_NAME, encoded, {
      httpOnly: true,
      sameSite: "lax",
      secure: requestUsesHttps(req),
      path: "/",
      maxAge: OIDC_FLOW_TTL_MS,
    });
  };
  const redirectToLoginWithError = (
    req: Request,
    res: Response,
    errorCode: string,
    returnTo?: string,
  ) => {
    const search = new URLSearchParams();
    search.set("oidcError", errorCode);
    search.set("oidcErrorMessage", getOidcErrorMessage(errorCode));
    if (returnTo) {
      search.set("returnTo", sanitizeReturnTo(returnTo));
    }
    clearOidcFlowCookie(req, res);
    return res.redirect(`/login?${search.toString()}`);
  };
  router.get("/oidc/start", async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      const client = await getOidcClient();
      const state = generators.state();
      const nonce = generators.nonce();
      const codeVerifier = generators.codeVerifier();
      const codeChallenge = generators.codeChallenge(codeVerifier);
      const returnTo = sanitizeReturnTo(req.query.returnTo);
      setOidcFlowCookie(req, res, {
        state,
        nonce,
        codeVerifier,
        returnTo,
        expiresAt: Date.now() + OIDC_FLOW_TTL_MS,
      });
      const authorizationUrl = client.authorizationUrl({
        scope: config.oidc.scopes,
        response_type: "code",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });
      return res.redirect(authorizationUrl);
    } catch (error) {
      console.error("OIDC start error:", error);
      return redirectToLoginWithError(req, res, "callback_failed");
    }
  });
  registerOidcCallbackRoute({
    ...deps,
    clearOidcFlowCookie,
    redirectToLoginWithError,
    getOidcClient,
    buildOidcClient,
  });
};
