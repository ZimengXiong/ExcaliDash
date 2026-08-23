import crypto from "crypto";
import { config } from "../../config";

// Pure OAuth helpers for the ChatGPT (Codex) subscription provider. No DB or
// request state here so the flow can be unit-tested in isolation. The wire
// protocol mirrors the public Codex CLI client; every endpoint/id comes from
// config so a self-hoster can override it if OpenAI moves something.
//
// Flow: authorization-code + PKCE (S256) against the Codex OAuth client. The
// authorize URL redirects to a loopback URI (http://localhost:1455/...); since
// ExcaliDash is a web app that cannot host that loopback, the connect UI has
// the user paste the full redirect URL back (the code + state live in its query
// string). A device-code variant exists (see docs) but the redirect flow is the
// primary, most broadly compatible path.

const cfg = () => config.ai.chatgpt;

const b64url = (buf: Buffer): string =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export type PkcePair = { verifier: string; challenge: string };

/** Generates a PKCE verifier/challenge pair using S256, per RFC 7636. */
export const generatePkce = (): PkcePair => {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge };
};

/** Random OAuth `state` value for CSRF protection. */
export const createState = (): string => crypto.randomBytes(24).toString("hex");

export type ChatGptTokens = {
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
  /** Access-token expiry as epoch ms. */
  expiresAt: number;
  accountId: string;
  email: string | null;
  planType: string | null;
};

export class ChatGptOAuthError extends Error {
  /** True when the user must sign in again (dead refresh token, invalid grant). */
  permanent: boolean;
  status: number;
  constructor(message: string, opts: { permanent?: boolean; status?: number } = {}) {
    super(message);
    this.name = "ChatGptOAuthError";
    this.permanent = opts.permanent ?? false;
    this.status = opts.status ?? 502;
  }
};

const AUTH_CLAIM = "https://api.openai.com/auth";

/** Decodes a JWT payload without verifying (tokens come from OpenAI over TLS). */
export const decodeJwt = (token: string | null | undefined): Record<string, unknown> | null => {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf-8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads the ChatGPT account id from an id (or access) token. */
export const deriveAccountId = (token: string | null | undefined): string | null => {
  const auth = decodeJwt(token)?.[AUTH_CLAIM];
  if (isRecord(auth) && typeof auth.chatgpt_account_id === "string") {
    return auth.chatgpt_account_id;
  }
  return null;
};

const derivePlanType = (token: string | null | undefined): string | null => {
  const auth = decodeJwt(token)?.[AUTH_CLAIM];
  if (isRecord(auth) && typeof auth.chatgpt_plan_type === "string") {
    return auth.chatgpt_plan_type;
  }
  return null;
};

const deriveEmail = (token: string | null | undefined): string | null => {
  const email = decodeJwt(token)?.email;
  return typeof email === "string" && email.length > 0 ? email : null;
};

const tokenExpiryMs = (token: string | null | undefined): number | null => {
  const exp = decodeJwt(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
};

/** Builds the authorization URL the user opens to grant access. */
export const buildAuthorizeUrl = (params: {
  pkce: PkcePair;
  state: string;
}): string => {
  const c = cfg();
  const url = new URL(`${c.issuer}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("redirect_uri", c.redirectUri);
  url.searchParams.set("scope", c.scope);
  url.searchParams.set("code_challenge", params.pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", c.originator);
  return url.toString();
};

/** Parses a pasted redirect URL / `code#state` / bare code into its parts. */
export const parseAuthorizationInput = (
  input: string,
): { code?: string; state?: string } => {
  const value = (input || "").trim();
  if (!value) return {};
  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    };
  } catch {
    /* not a URL */
  }
  if (value.includes("code=")) {
    const params = new URLSearchParams(value.replace(/^[?#]/, ""));
    return {
      code: params.get("code") ?? undefined,
      state: params.get("state") ?? undefined,
    };
  }
  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    return { code, state };
  }
  return { code: value };
};

const toTokens = (
  raw: {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  },
  previousRefresh?: string,
): ChatGptTokens => {
  const accessToken = raw.access_token;
  const refreshToken = raw.refresh_token ?? previousRefresh;
  if (!accessToken || !refreshToken) {
    throw new ChatGptOAuthError("Token response missing access/refresh token");
  }
  const idToken = raw.id_token ?? null;
  const accountId = deriveAccountId(idToken) ?? deriveAccountId(accessToken);
  if (!accountId) {
    throw new ChatGptOAuthError("Could not derive ChatGPT account id from token");
  }
  const expiresAt =
    typeof raw.expires_in === "number"
      ? Date.now() + raw.expires_in * 1000
      : tokenExpiryMs(accessToken) ?? Date.now() + 60 * 60 * 1000;
  return {
    accessToken,
    refreshToken,
    idToken,
    expiresAt,
    accountId,
    email: deriveEmail(idToken) ?? deriveEmail(accessToken),
    planType: derivePlanType(idToken) ?? derivePlanType(accessToken),
  };
};

const DEAD_REFRESH = new Set([
  "refresh_token_expired",
  "refresh_token_reused",
  "refresh_token_invalidated",
  "invalid_grant",
]);

const postToken = async (body: URLSearchParams): Promise<Response> => {
  try {
    return await fetch(`${cfg().issuer}/oauth/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body,
    });
  } catch (error) {
    throw new ChatGptOAuthError(
      `Failed to reach the ChatGPT token endpoint: ${(error as Error).message}`,
    );
  }
};

/** Exchanges an authorization code (+ PKCE verifier) for tokens. */
export const exchangeAuthorizationCode = async (params: {
  code: string;
  codeVerifier: string;
}): Promise<ChatGptTokens> => {
  const c = cfg();
  const res = await postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.clientId,
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: c.redirectUri,
    }),
  );
  if (!res.ok) {
    await res.text().catch(() => "");
    throw new ChatGptOAuthError(
      `Authorization code exchange failed (${res.status})`,
      { status: 400, permanent: true },
    );
  }
  return toTokens((await res.json()) as Record<string, never>);
};

/** Exchanges a refresh token for a fresh access token (+ possibly new refresh). */
export const refreshTokens = async (refreshToken: string): Promise<ChatGptTokens> => {
  const c = cfg();
  const res = await postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: c.clientId,
      refresh_token: refreshToken,
      scope: c.scope,
    }),
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let code = "";
    try {
      code = (JSON.parse(text)?.error ?? "").toString();
    } catch {
      /* non-JSON */
    }
    if (code && DEAD_REFRESH.has(code)) {
      throw new ChatGptOAuthError(
        `Refresh token is no longer valid (${code}). The user must reconnect.`,
        { permanent: true, status: 401 },
      );
    }
    throw new ChatGptOAuthError(`Token refresh failed (${res.status})`);
  }
  return toTokens((await res.json()) as Record<string, never>, refreshToken);
};
