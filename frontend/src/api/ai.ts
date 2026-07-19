import { api, API_URL } from "./client";
import { ensureCsrfToken, getCsrfHeader } from "./auth";

export type AiProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "opencode_go"
  | "custom"
  | "chatgpt"
  | "disabled";

export type AiModelOption = {
  id: string;
  label: string;
  reasoningEfforts: string[];
};

export type AiProviderProfile = {
  id: string;
  label: string;
  provider: AiProvider;
  available: boolean;
  enabled: boolean;
  baseUrl: string | null;
  models: AiModelOption[];
  customModels: AiModelOption[];
  keyConfigured: boolean;
  keySource: "env" | "db" | null;
};

export type AiProviderDefinition = {
  id: Exclude<AiProvider, "disabled">;
  label: string;
  baseUrl: string | null;
  defaultModel: string | null;
  protocol:
    | "openai-chat-completions"
    | "anthropic-messages"
    | "mixed"
    | "chatgpt-subscription";
  discovery: "live" | "fallback" | "subscription";
  help: string;
};

export type AiProviderProbe = {
  profileId?: string;
  provider: Exclude<AiProvider, "disabled">;
  apiKey?: string;
  baseUrl?: string | null;
  model?: string | null;
  refresh?: boolean;
};

export type AiModelDiscoveryResult = {
  models: AiModelOption[];
  source: "live" | "cache" | "fallback" | "configured";
  warning?: string;
  fetchedAt: string;
};

export type AiConnectionTestResult = {
  ok: boolean;
  code:
    | "success"
    | "authentication_failure"
    | "unreachable"
    | "unsupported_model"
    | "rate_limited"
    | "malformed_response"
    | "configuration_error";
  message: string;
  guidance?: string;
  models?: AiModelOption[];
};

export const discoverAiProviderModels = async (
  input: AiProviderProbe,
): Promise<AiModelDiscoveryResult> =>
  (await api.post<AiModelDiscoveryResult>("/auth/ai/providers/models", input)).data;

export const testAiProviderConnection = async (
  input: AiProviderProbe,
): Promise<AiConnectionTestResult> =>
  (await api.post<AiConnectionTestResult>("/auth/ai/providers/test", input)).data;

/** Availability probe mirroring the backend `GET /ai/status` payload. */
export type AiStatus = {
  enabled: boolean;
  available: boolean;
  provider: AiProvider;
  model: string | null;
  keyConfigured: boolean;
  keySource: "env" | "db" | null;
  chatgptEnabled: boolean;
  defaultProviderId: string | null;
  providers: AiProviderProfile[];
};

export const getAiStatus = async (): Promise<AiStatus> => {
  const response = await api.get<AiStatus>("/ai/status");
  return response.data;
};

export type ChatRole = "user" | "assistant";
export type ChatTurn = { role: ChatRole; content: string };

export type StoredAgentChatMessage = {
  id: string;
  drawingId: string;
  turnId: string;
  clientRequestId?: string;
  role: ChatRole;
  text: string;
  thinking?: string;
  status: "streaming" | "complete" | "error" | "interrupted";
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
  tools: {
    id: string;
    name: string;
    status: "running" | "success" | "error";
    message?: string;
  }[];
  batches: {
    opsBatchId: string;
    version: number;
    revertVersion: number;
    summaryDelta: string[];
    status: "applied" | "reverting" | "reverted" | "revert-failed";
  }[];
  error?: string;
  opErrors: OpError[];
  author?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export const getAgentChatMessages = async (
  drawingId: string,
): Promise<StoredAgentChatMessage[]> => {
  const response = await api.get<{ messages: StoredAgentChatMessage[] }>(
    `/ai/chat/${drawingId}/messages`,
  );
  return response.data.messages;
};

export type OpError = {
  opIndex: number;
  code: string;
  message: string;
  elementId?: string;
};

/** Emitted once per applied op batch during a streamed chat turn. */
export type OpsAppliedEvent = {
  opsBatchId: string;
  version: number;
  revertVersion: number;
  summaryDelta: string[];
};

export type AgentChatError = {
  code: string;
  message?: string;
  errors?: OpError[];
};

export type AgentChatHandlers = {
  onMessage?: (message: StoredAgentChatMessage) => void;
  onThinking?: (text: string) => void;
  onToken?: (text: string) => void;
  onToolCall?: (call: { name: string; id: string }) => void;
  onToolResult?: (result: {
    name: string;
    id: string;
    ok: boolean;
    message?: string;
  }) => void;
  onOpsApplied?: (event: OpsAppliedEvent) => void;
  onError?: (error: AgentChatError) => void;
  onDone?: () => void;
};

const parseSseFrame = (
  frame: string,
): { event: string; data: unknown } | null => {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
};

const dispatchSse = (
  event: string,
  data: any,
  handlers: AgentChatHandlers,
): boolean => {
  switch (event) {
    case "message":
      if (data?.id && data?.role) handlers.onMessage?.(data);
      return false;
    case "thinking":
      if (typeof data?.text === "string") handlers.onThinking?.(data.text);
      return false;
    case "token":
      if (typeof data?.text === "string") handlers.onToken?.(data.text);
      return false;
    case "tool_call":
      handlers.onToolCall?.({ name: data?.name, id: data?.id });
      return false;
    case "tool_result":
      handlers.onToolResult?.({
        name: data?.name,
        id: data?.id,
        ok: data?.ok === true,
        message: typeof data?.message === "string" ? data.message : undefined,
      });
      return false;
    case "ops_applied":
      handlers.onOpsApplied?.({
        opsBatchId: data?.opsBatchId,
        version: data?.version,
        revertVersion: data?.revertVersion,
        summaryDelta: Array.isArray(data?.summaryDelta) ? data.summaryDelta : [],
      });
      return false;
    case "error":
      handlers.onError?.({
        code: typeof data?.code === "string" ? data.code : "ERROR",
        message: typeof data?.message === "string" ? data.message : undefined,
        errors: Array.isArray(data?.errors) ? data.errors : undefined,
      });
      return false;
    case "done":
      handlers.onDone?.();
      return true;
    default:
      return false;
  }
};

/**
 * POST /ai/chat as an SSE stream. Because the endpoint takes a JSON body it
 * cannot use `EventSource`; we read the response body stream and parse SSE
 * frames by hand. Cookies + CSRF header are attached exactly as the axios
 * client would (the chat proxy is session-only, never agent tokens).
 */
export const streamAgentChat = async (
  params: {
    drawingId: string;
    message: string;
    clientRequestId: string;
    providerId?: string;
    model?: string;
    reasoningEffort?: string;
    canvasImage?: string;
    canvasState?: "captured" | "blank" | "unavailable";
    signal?: AbortSignal;
  },
  handlers: AgentChatHandlers,
): Promise<void> => {
  await ensureCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  const csrf = getCsrfHeader();
  if (csrf) headers[csrf.name] = csrf.token;

  let response: Response;
  try {
    response = await fetch(`${API_URL}/ai/chat`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        drawingId: params.drawingId,
        message: params.message,
        clientRequestId: params.clientRequestId,
        providerId: params.providerId,
        model: params.model,
        reasoningEffort: params.reasoningEffort,
        canvasImage: params.canvasImage,
        canvasState: params.canvasState,
      }),
      signal: params.signal,
    });
  } catch (error) {
    if (params.signal?.aborted) return;
    handlers.onError?.({
      code: "NETWORK_ERROR",
      message: error instanceof Error ? error.message : "Network error",
    });
    return;
  }

  if (!response.ok || !response.body) {
    let message = "The AI request failed";
    let code = `HTTP_${response.status}`;
    try {
      const data = await response.json();
      message = data?.message || data?.error || message;
      if (typeof data?.code === "string") code = data.code;
    } catch {
      /* non-JSON error body */
    }
    handlers.onError?.({ code, message });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseSseFrame(frame);
        if (parsed && dispatchSse(parsed.event, parsed.data, handlers)) return;
      }
    }
  } catch (error) {
    if (params.signal?.aborted) return;
    handlers.onError?.({
      code: "STREAM_ERROR",
      message: error instanceof Error ? error.message : "Stream error",
    });
  }
};

export type RevertResult = {
  opsBatchId: string;
  version: number;
  revertVersion: number;
};

/**
 * Undo an applied batch by asking the server to revert to the pre-batch
 * snapshot (`revertVersion`). Server-authoritative and collab-safe (D5):
 * the compensating update is itself snapshotted, so redo stays possible.
 */
export const revertOpsBatch = async (
  drawingId: string,
  revertVersion: number,
): Promise<RevertResult> => {
  const response = await api.post<RevertResult>(`/drawings/${drawingId}/ops`, {
    ops: [{ op: "revert_to_snapshot", version: revertVersion }],
  });
  return response.data;
};
