import { API_URL, api } from "./client";
import { ensureCsrfToken, getCsrfHeader } from "./auth";

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string | null;
  createdAt: string;
};

export type AiBoardOperation =
  | {
      type: "create";
      elements: Array<
        Record<string, unknown> & { type: string; x: number; y: number }
      >;
    }
  | {
      type: "update";
      elementId: string;
      changes: Record<string, unknown>;
    }
  | { type: "delete"; elementId: string };

export type AiMessageResponse = {
  conversationId: string;
  messages: AiChatMessage[];
  operations: AiBoardOperation[];
};

export const getAiConversation = async (
  drawingId: string,
): Promise<{ conversationId: string | null; messages: AiChatMessage[] }> => {
  const response = await api.get(`/drawings/${drawingId}/ai/conversation`);
  return response.data;
};

export const sendAiMessage = async (
  drawingId: string,
  message: string,
): Promise<AiMessageResponse> => {
  const response = await api.post(`/drawings/${drawingId}/ai/messages`, {
    message,
  });
  return response.data;
};

export const streamAiMessage = async (
  drawingId: string,
  message: string,
  onReasoning: (text: string) => void,
): Promise<AiMessageResponse> => {
  await ensureCsrfToken();
  const csrf = getCsrfHeader();
  const headers: Record<string, string> = {
    Accept: "application/x-ndjson",
    "Content-Type": "application/json",
  };
  if (csrf) headers[csrf.name] = csrf.token;

  const response = await fetch(
    `${API_URL}/drawings/${drawingId}/ai/messages/stream`,
    {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({ message }),
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.message || `AI request failed with status ${response.status}`,
    );
  }
  if (!response.body) throw new Error("AI streaming is not available");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AiMessageResponse | null = null;

  const processLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "reasoning" && typeof event.text === "string") {
      onReasoning(event.text);
    } else if (event.type === "done") {
      result = event as AiMessageResponse;
    } else if (event.type === "error") {
      throw new Error(event.message || "The AI request could not be completed");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      processLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) processLine(buffer);
  if (!result) throw new Error("Kimi returned no completed response");
  return result;
};

export const clearAiConversation = async (drawingId: string): Promise<void> => {
  await api.delete(`/drawings/${drawingId}/ai/conversation`);
};
