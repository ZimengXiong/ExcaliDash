import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const applyBaseOidcEnv = () => {
  process.env.AUTH_MODE = "oidc_enforced";
  process.env.OIDC_ISSUER_URL = "https://issuer.example";
  process.env.OIDC_CLIENT_ID = "client-id";
  process.env.OIDC_REDIRECT_URI = "https://app.example/api/auth/oidc/callback";
  process.env.JWT_SECRET = "x".repeat(32);
};

const loadConfig = async () => {
  vi.resetModules();
  return import("./config");
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("OIDC signing algorithm config", () => {
  it("defaults to RS256", async () => {
    applyBaseOidcEnv();

    const { config } = await loadConfig();

    expect(config.oidc.idTokenSignedResponseAlg).toBeNull();
  });

  it("accepts an explicit configured algorithm", async () => {
    applyBaseOidcEnv();
    process.env.OIDC_CLIENT_SECRET = "client-secret";
    process.env.OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG = "HS256";

    const { config } = await loadConfig();

    expect(config.oidc.idTokenSignedResponseAlg).toBe("HS256");
  });

  it("rejects none", async () => {
    applyBaseOidcEnv();
    process.env.OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG = "none";

    await expect(loadConfig()).rejects.toThrow(
      "OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG must not be empty or 'none'"
    );
  });

  it("ignores the override when OIDC is disabled", async () => {
    process.env.AUTH_MODE = "local";
    process.env.OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG = "not-a-real-alg";

    const { config } = await loadConfig();

    expect(config.oidc.enabled).toBe(false);
    expect(config.oidc.idTokenSignedResponseAlg).toBeNull();
  });

  it("requires a client secret for HS algorithms", async () => {
    applyBaseOidcEnv();
    delete process.env.OIDC_CLIENT_SECRET;
    process.env.OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG = "HS256";

    await expect(loadConfig()).rejects.toThrow(
      "OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG using HS* requires OIDC_CLIENT_SECRET"
    );
  });
});
