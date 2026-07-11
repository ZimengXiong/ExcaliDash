import { readCsv, readNumber, readOptionalString, readRaw } from "./env";

export type AiProvider = "disabled" | "anthropic" | "openai" | "custom" | "chatgpt";

export interface AiChatGptConfig {
  /**
   * `client_version` query param sent to the ChatGPT/Codex backend. The backend
   * gates the available model set on this value — a stale version makes models
   * report as unsupported. Self-hosters bump this without a release when models
   * disappear. See docs/AGENT_API.md.
   */
  clientVersion: string;
  /** Public OAuth client id used by the Codex CLI (overridable for resilience). */
  clientId: string;
  /** OAuth issuer / authorization-server origin. */
  issuer: string;
  /** OAuth scopes requested for a refreshable ChatGPT session. */
  scope: string;
  /** Loopback redirect URI the authorize flow returns to (manual-paste flow). */
  redirectUri: string;
  /** Base URL of the ChatGPT-backed Codex model API. */
  codexBaseUrl: string;
  /** `originator` header/param identifying the client to OpenAI. */
  originator: string;
  /** Candidate model slugs offered in the UI (first is the default). */
  models: string[];
}

export interface AiConfig {
  provider: AiProvider;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokensPerRequest: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  chatgpt: AiChatGptConfig;
}

const parseAiProvider = (rawValue: string | undefined): AiProvider => {
  const normalized = (rawValue || "disabled").trim().toLowerCase();
  if (
    normalized === "disabled" ||
    normalized === "anthropic" ||
    normalized === "openai" ||
    normalized === "custom" ||
    normalized === "chatgpt"
  ) {
    return normalized;
  }
  throw new Error(
    "Invalid AI_PROVIDER. Expected one of: disabled, anthropic, openai, custom, chatgpt",
  );
};

// Sensible defaults mirror the public Codex CLI client. Every value is
// overridable so the integration keeps working if OpenAI moves an endpoint.
const DEFAULT_CHATGPT_MODELS = [
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.1-codex-max",
];

const resolveChatGptConfig = (): AiChatGptConfig => {
  const models = readCsv("AI_CHATGPT_MODELS");
  return {
    clientVersion: readOptionalString("AI_CHATGPT_CLIENT_VERSION") ?? "0.142.5",
    clientId:
      readOptionalString("AI_CHATGPT_CLIENT_ID") ?? "app_EMoamEEZ73f0CkXaXp7hrann",
    issuer: (
      readOptionalString("AI_CHATGPT_ISSUER") ?? "https://auth.openai.com"
    ).replace(/\/+$/, ""),
    scope:
      readOptionalString("AI_CHATGPT_SCOPE") ?? "openid profile email offline_access",
    redirectUri:
      readOptionalString("AI_CHATGPT_REDIRECT_URI") ??
      "http://localhost:1455/auth/callback",
    codexBaseUrl: (
      readOptionalString("AI_CHATGPT_CODEX_BASE_URL") ??
      "https://chatgpt.com/backend-api/codex"
    ).replace(/\/+$/, ""),
    originator: readOptionalString("AI_CHATGPT_ORIGINATOR") ?? "codex_cli_rs",
    models: models.length > 0 ? models : DEFAULT_CHATGPT_MODELS,
  };
};

export const resolveAiConfig = (): AiConfig => ({
  provider: parseAiProvider(readRaw("AI_PROVIDER")),
  apiKey: readOptionalString("AI_API_KEY"),
  baseUrl: readOptionalString("AI_BASE_URL"),
  model: readOptionalString("AI_MODEL"),
  maxTokensPerRequest: readNumber("AI_MAX_TOKENS_PER_REQUEST", 4096),
  rateLimitMax: readNumber("AI_RATE_LIMIT_MAX", 60),
  rateLimitWindowMs: readNumber("AI_RATE_LIMIT_WINDOW_MS", 60000),
  chatgpt: resolveChatGptConfig(),
});
