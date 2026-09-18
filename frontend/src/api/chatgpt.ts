import { api } from "./client";

// Client for the per-user ChatGPT (subscription) provider. Tokens live entirely
// server-side; these endpoints only ever move an authorize URL, a pasted
// redirect URL, and non-secret connection status across the wire.

export type ChatGptConnectionStatus = {
  /** Admin kill-switch: whether the provider is offered at all. */
  enabled: boolean;
  /** Whether ChatGPT is the currently selected AI provider. */
  isActiveProvider: boolean;
  /** This user has a usable connection. */
  connected: boolean;
  /** A previously-good connection needs re-authorization. */
  needsReconnect: boolean;
  accountEmail: string | null;
  planType: string | null;
  models: string[];
  redirectUri: string;
};

export const getChatGptStatus = async (): Promise<ChatGptConnectionStatus> => {
  const res = await api.get<ChatGptConnectionStatus>("/ai/chatgpt/status");
  return res.data;
};

export type ChatGptConnectStart = {
  authorizeUrl: string;
  redirectUri: string;
};

/** Begins the OAuth flow; the caller opens `authorizeUrl` in a new tab. */
export const startChatGptConnect = async (): Promise<ChatGptConnectStart> => {
  const res = await api.post<ChatGptConnectStart>("/ai/chatgpt/connect", {});
  return res.data;
};

/**
 * Completes the OAuth flow from the redirect URL the user pastes back (its
 * query string carries the authorization `code` + CSRF `state`).
 */
export const completeChatGptConnect = async (
  redirectUrl: string,
): Promise<ChatGptConnectionStatus> => {
  const res = await api.post<ChatGptConnectionStatus>("/ai/chatgpt/callback", {
    redirectUrl,
  });
  return res.data;
};

export const disconnectChatGpt = async (): Promise<void> => {
  await api.post("/ai/chatgpt/disconnect", {});
};
