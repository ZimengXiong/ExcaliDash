import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("openid-client", () => {
  const issuer = {
    issuer: "http://keycloak:8080/realms/excalidash",
    metadata: {
      issuer: "http://keycloak:8080/realms/excalidash",
      end_session_endpoint:
        "http://keycloak:8080/realms/excalidash/protocol/openid-connect/logout",
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      id_token_signing_alg_values_supported: ["RS256"],
    },
  } as any;

  class MockClient {
    issuer = issuer;

    constructor(_config: Record<string, unknown>) {}
  }

  issuer.Client = MockClient;
  return {
    Issuer: { discover: vi.fn(async () => issuer) },
    generators: {
      state: () => "state",
      nonce: () => "nonce",
      codeVerifier: () => "verifier",
      codeChallenge: () => "challenge",
    },
  };
});

describe("OIDC logout", () => {
  it("uses the public issuer for the end-session redirect", async () => {
    const { registerOidcRoutes } = await import("./oidcRoutes");
    const app = express();
    const router = express.Router();
    app.use(router);
    registerOidcRoutes({
      router,
      prisma: {} as any,
      ensureAuthEnabled: vi.fn(async () => true),
      ensureSystemConfig: vi.fn(async () => ({
        id: "default",
        oidcJitProvisioningEnabled: true,
      })),
      sanitizeText: (input: unknown) => String(input ?? ""),
      generateTokens: vi.fn(() => ({ accessToken: "access", refreshToken: "refresh" })),
      setAuthCookies: vi.fn(),
      getRefreshTokenExpiresAt: () => new Date(Date.now() + 60_000),
      isMissingRefreshTokenTableError: () => false,
      config: {
        authMode: "oidc_enforced",
        jwtSecret: "test-secret",
        enableRefreshTokenRotation: false,
        enableAuditLogging: false,
        oidc: {
          enabled: true,
          enforced: true,
          providerName: "Keycloak",
          issuerUrl: "http://localhost:18080/realms/excalidash",
          discoveryUrl: "http://keycloak:8080/realms/excalidash",
          clientId: "excalidash",
          clientSecret: "secret",
          redirectUri: "http://localhost:1103/api/auth/oidc/callback",
          idTokenSignedResponseAlg: null,
          tokenEndpointAuthMethod: null,
          scopes: "openid profile email",
          emailClaim: "email",
          emailVerifiedClaim: "email_verified",
          groupsClaim: "groups",
          adminGroups: [],
          requireEmailVerified: true,
          jitProvisioning: true,
          firstUserAdmin: true,
        },
      },
    });

    const response = await request(app).get("/oidc/logout");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "http://localhost:18080/realms/excalidash/protocol/openid-connect/logout?post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A1103%2Flogin&client_id=excalidash",
    );
  });
});
