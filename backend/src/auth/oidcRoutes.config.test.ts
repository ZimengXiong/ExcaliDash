import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const discoverMock = vi.fn();
const clientConfigs: Record<string, unknown>[] = [];
const issuerMetadata = {
  token_endpoint_auth_methods_supported: ["client_secret_basic"],
  id_token_signing_alg_values_supported: ["RS256"],
};

vi.mock("openid-client", () => {
  const issuer = {
    metadata: issuerMetadata,
  } as any;

  class MockClient {
    constructor(config: Record<string, unknown>) {
      clientConfigs.push({ ...config });
    }

    authorizationUrl() {
      return "https://issuer.example/auth";
    }
  }

  issuer.Client = MockClient;
  discoverMock.mockResolvedValue(issuer);

  return {
    Issuer: {
      discover: discoverMock,
    },
    generators: {
      state: () => "state-fixed",
      nonce: () => "nonce-fixed",
      codeVerifier: () => "verifier-fixed",
      codeChallenge: () => "challenge-fixed",
    },
  };
});

describe("OIDC client configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientConfigs.length = 0;
    issuerMetadata.token_endpoint_auth_methods_supported = ["client_secret_basic"];
    issuerMetadata.id_token_signing_alg_values_supported = ["RS256"];
  });

  it("passes the configured id_token_signed_response_alg to the OIDC client", async () => {
    const { registerOidcRoutes } = await import("./oidcRoutes");

    const router = express.Router();
    const app = express();
    app.use(router);

    registerOidcRoutes({
      router,
      prisma: {} as any,
      ensureAuthEnabled: vi.fn(async () => true),
      ensureSystemConfig: vi.fn(async () => ({
        id: "default",
        oidcJitProvisioningEnabled: null,
        authEnabled: true,
        authOnboardingCompleted: true,
        registrationEnabled: false,
        authLoginRateLimitEnabled: true,
        authLoginRateLimitWindowMs: 900000,
        authLoginRateLimitMax: 20,
      })),
      sanitizeText: (input: unknown) => String(input ?? ""),
      generateTokens: vi.fn(() => ({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      })),
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
          providerName: "Test OIDC",
          issuerUrl: "https://issuer.example",
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUri: "https://app.example/api/auth/oidc/callback",
          idTokenSignedResponseAlg: "HS256",
          scopes: "openid email profile",
          emailClaim: "email",
          emailVerifiedClaim: "email_verified",
          requireEmailVerified: true,
          jitProvisioning: true,
          firstUserAdmin: true,
        },
      },
    });

    const response = await request(app).get("/oidc/start");

    expect(response.status).toBe(302);
    expect(discoverMock).toHaveBeenCalledTimes(1);
    expect(clientConfigs[0]?.id_token_signed_response_alg).toBe("HS256");
  });

  it("falls back to the first advertised provider alg when no override is configured", async () => {
    issuerMetadata.id_token_signing_alg_values_supported = ["HS256", "RS256"];

    const { registerOidcRoutes } = await import("./oidcRoutes");

    const router = express.Router();
    const app = express();
    app.use(router);

    registerOidcRoutes({
      router,
      prisma: {} as any,
      ensureAuthEnabled: vi.fn(async () => true),
      ensureSystemConfig: vi.fn(async () => ({
        id: "default",
        oidcJitProvisioningEnabled: null,
        authEnabled: true,
        authOnboardingCompleted: true,
        registrationEnabled: false,
        authLoginRateLimitEnabled: true,
        authLoginRateLimitWindowMs: 900000,
        authLoginRateLimitMax: 20,
      })),
      sanitizeText: (input: unknown) => String(input ?? ""),
      generateTokens: vi.fn(() => ({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      })),
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
          providerName: "Test OIDC",
          issuerUrl: "https://issuer.example",
          clientId: "client-id",
          clientSecret: "client-secret",
          redirectUri: "https://app.example/api/auth/oidc/callback",
          idTokenSignedResponseAlg: null,
          scopes: "openid email profile",
          emailClaim: "email",
          emailVerifiedClaim: "email_verified",
          requireEmailVerified: true,
          jitProvisioning: true,
          firstUserAdmin: true,
        },
      },
    });

    const response = await request(app).get("/oidc/start");

    expect(response.status).toBe(302);
    expect(clientConfigs[0]?.id_token_signed_response_alg).toBe("HS256");
  });
});
