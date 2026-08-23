import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  createState,
  decodeJwt,
  deriveAccountId,
  generatePkce,
  parseAuthorizationInput,
} from "./oauth";
import { config } from "../../config";

const b64url = (obj: unknown): string =>
  Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const makeJwt = (payload: unknown): string =>
  `${b64url({ alg: "none" })}.${b64url(payload)}.sig`;

describe("chatgpt/oauth PKCE", () => {
  it("derives an S256 challenge from the verifier", () => {
    const { verifier, challenge } = generatePkce();
    const expected = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
    expect(verifier).not.toContain("=");
  });

  it("produces distinct random state values", () => {
    expect(createState()).not.toBe(createState());
  });
});

describe("chatgpt/oauth authorize URL", () => {
  it("includes the required OAuth + PKCE params", () => {
    const pkce = generatePkce();
    const url = new URL(buildAuthorizeUrl({ pkce, state: "st8" }));
    const c = config.ai.chatgpt;
    expect(url.origin + url.pathname).toBe(`${c.issuer}/oauth/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(c.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(c.redirectUri);
    expect(url.searchParams.get("scope")).toBe(c.scope);
    expect(url.searchParams.get("code_challenge")).toBe(pkce.challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("originator")).toBe(c.originator);
  });
});

describe("chatgpt/oauth parseAuthorizationInput", () => {
  it("parses a full redirect URL", () => {
    const parsed = parseAuthorizationInput(
      "http://localhost:1455/auth/callback?code=abc&state=xyz",
    );
    expect(parsed).toEqual({ code: "abc", state: "xyz" });
  });

  it("parses a bare query string", () => {
    expect(parseAuthorizationInput("code=abc&state=xyz")).toEqual({
      code: "abc",
      state: "xyz",
    });
  });

  it("parses code#state shorthand", () => {
    expect(parseAuthorizationInput("abc#xyz")).toEqual({ code: "abc", state: "xyz" });
  });

  it("treats a bare token as the code", () => {
    expect(parseAuthorizationInput("just-a-code")).toEqual({ code: "just-a-code" });
  });

  it("returns empty for blank input", () => {
    expect(parseAuthorizationInput("   ")).toEqual({});
  });
});

describe("chatgpt/oauth JWT claims", () => {
  it("extracts the ChatGPT account id from the auth claim", () => {
    const token = makeJwt({
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acc_123",
        chatgpt_plan_type: "plus",
      },
      email: "user@example.com",
      exp: 1893456000,
    });
    expect(deriveAccountId(token)).toBe("acc_123");
    expect(decodeJwt(token)?.email).toBe("user@example.com");
  });

  it("returns null for malformed tokens", () => {
    expect(decodeJwt("not-a-jwt")).toBeNull();
    expect(deriveAccountId("a.b")).toBeNull();
    expect(deriveAccountId(null)).toBeNull();
  });
});
