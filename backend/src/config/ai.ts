import { readNumber, readOptionalString, readRaw } from "./env";

export type AiProvider = "disabled" | "anthropic" | "openai" | "custom";

export interface AiConfig {
  provider: AiProvider;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokensPerRequest: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

const parseAiProvider = (rawValue: string | undefined): AiProvider => {
  const normalized = (rawValue || "disabled").trim().toLowerCase();
  if (
    normalized === "disabled" ||
    normalized === "anthropic" ||
    normalized === "openai" ||
    normalized === "custom"
  ) {
    return normalized;
  }
  throw new Error(
    "Invalid AI_PROVIDER. Expected one of: disabled, anthropic, openai, custom",
  );
};

export const resolveAiConfig = (): AiConfig => ({
  provider: parseAiProvider(readRaw("AI_PROVIDER")),
  apiKey: readOptionalString("AI_API_KEY"),
  baseUrl: readOptionalString("AI_BASE_URL"),
  model: readOptionalString("AI_MODEL"),
  maxTokensPerRequest: readNumber("AI_MAX_TOKENS_PER_REQUEST", 4096),
  rateLimitMax: readNumber("AI_RATE_LIMIT_MAX", 60),
  rateLimitWindowMs: readNumber("AI_RATE_LIMIT_WINDOW_MS", 60000),
});
