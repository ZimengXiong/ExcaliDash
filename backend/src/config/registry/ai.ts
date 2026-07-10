import type { EnvVarSpec } from "./types";

export const aiEnv: readonly EnvVarSpec[] = [
  {
    name: "AI_PROVIDER",
    group: "AI",
    kind: "enum",
    values: ["disabled", "anthropic", "openai", "custom"],
    default: "disabled",
    doc: "AI chat-proxy provider: disabled (chat panel hidden), anthropic (Messages API), openai (Chat Completions), or custom (any OpenAI-compatible baseUrl). The admin settings page can override this at runtime.",
  },
  {
    name: "AI_API_KEY",
    group: "AI",
    kind: "string",
    secret: true,
    doc: "Provider API key for the AI chat proxy. Server-side only — never shipped to the browser. An env-provided key always wins over a key stored via the admin settings page.",
    example: "sk-...",
  },
  {
    name: "AI_BASE_URL",
    group: "AI",
    kind: "string",
    doc: "Override the provider base URL (e.g. an OpenAI-compatible gateway or self-hosted endpoint). Required for AI_PROVIDER=custom; optional otherwise.",
    example: "https://api.openai.com/v1",
  },
  {
    name: "AI_MODEL",
    group: "AI",
    kind: "string",
    doc: "Model id the chat proxy requests (e.g. claude-opus-4-8 for anthropic, gpt-4o for openai). Falls back to a provider default when unset.",
    example: "claude-opus-4-8",
  },
  {
    name: "AI_MAX_TOKENS_PER_REQUEST",
    group: "AI",
    kind: "number",
    default: "4096",
    doc: "Maximum output tokens the chat proxy requests per model call.",
  },
  {
    name: "AI_RATE_LIMIT_MAX",
    group: "AI",
    kind: "number",
    default: "60",
    doc: "Maximum AI chat requests allowed per user within AI_RATE_LIMIT_WINDOW_MS.",
  },
  {
    name: "AI_RATE_LIMIT_WINDOW_MS",
    group: "AI",
    kind: "number",
    default: "60000",
    doc: "Rolling window (ms) for the AI chat per-user rate limiter.",
  },
];
