import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { AgentCanvasCapture } from "./captureAgentCanvas";
import {
  getAgentChatMessages,
  revertOpsBatch,
  streamAgentChat,
  type AgentChatError,
  type OpError,
  type OpsAppliedEvent,
  type StoredAgentChatMessage,
} from "../../api/ai";

export type BatchStatus =
  | "applied"
  | "reverting"
  | "reverted"
  | "revert-failed";

export type ChatBatch = {
  opsBatchId: string;
  version: number;
  revertVersion: number;
  summaryDelta: string[];
  status: BatchStatus;
};

export type AgentToolActivity = {
  id: string;
  name: string;
  status: "running" | "success" | "error";
  message?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  batches: ChatBatch[];
  tools?: AgentToolActivity[];
  opErrors?: OpError[];
  error?: string;
  streaming: boolean;
  turnId?: string;
  clientRequestId?: string;
  author?: { id: string; name: string };
  createdAt?: string;
  updatedAt?: string;
};

type UseAgentChatArgs = {
  drawingId?: string;
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
  socket?: Socket | null;
  captureCanvasContext?: () => Promise<AgentCanvasCapture>;
  /**
   * Register an applied batch as self-originated so the collaboration layer
   * replays the incoming socket update with `captureUpdate: IMMEDIATELY`,
   * making the agent edit natively undoable for the requesting user (D5).
   */
  onSelfOpsBatch?: (opsBatchId: string) => void;
};

const toChatMessage = (message: StoredAgentChatMessage): ChatMessage => ({
  id: message.id,
  role: message.role,
  text: message.text,
  thinking: message.thinking,
  batches: message.batches,
  tools: message.tools,
  opErrors: message.opErrors,
  error: message.error,
  streaming: message.status === "streaming",
  turnId: message.turnId,
  clientRequestId: message.clientRequestId,
  author: message.author,
  createdAt: message.createdAt,
  updatedAt: message.updatedAt,
});

const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => {
    const time = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    if (time !== 0) return time;
    if (a.turnId && a.turnId === b.turnId && a.role !== b.role) {
      return a.role === "user" ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
};

export const useAgentChat = ({
  drawingId,
  providerId,
  model,
  reasoningEffort,
  socket,
  captureCanvasContext,
  onSelfOpsBatch,
}: UseAgentChatArgs) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  // Mirror of `messages` for synchronous reads (history assembly) that must not
  // wait for a state flush.
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeRequestIdRef = useRef<string | null>(null);

  const commit = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      messagesRef.current = updater(messagesRef.current);
      setMessages(messagesRef.current);
    },
    [],
  );

  const patchMessage = useCallback(
    (id: string, patch: (prev: ChatMessage) => ChatMessage) => {
      commit((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
    },
    [commit],
  );

  const upsertStoredMessage = useCallback(
    (stored: StoredAgentChatMessage, requestId?: string) => {
      const message = toChatMessage(stored);
      commit((prev) => {
        const withoutOptimistic = prev.filter((item) => {
          if (!requestId) return true;
          return item.id !== `local:${requestId}:${message.role}`;
        });
        return mergeMessages(withoutOptimistic, [message]);
      });
    },
    [commit],
  );

  const applyEvent = useCallback(
    (messageId: string, event: string, data: any, registerSelf = false) => {
      if (event === "thinking") {
        patchMessage(messageId, (message) => ({
          ...message,
          thinking: `${message.thinking ?? ""}${data?.text ?? ""}`,
        }));
      } else if (event === "token") {
        patchMessage(messageId, (message) => ({
          ...message,
          text: `${message.text}${data?.text ?? ""}`,
        }));
      } else if (event === "tool_call") {
        patchMessage(messageId, (message) => ({
          ...message,
          tools: [
            ...(message.tools ?? []).filter((tool) => tool.id !== data?.id),
            { id: data?.id, name: data?.name, status: "running" },
          ],
        }));
      } else if (event === "tool_result") {
        patchMessage(messageId, (message) => ({
          ...message,
          tools: (message.tools ?? []).map((tool) =>
            tool.id === data?.id
              ? {
                  ...tool,
                  status: data?.ok === true ? "success" : "error",
                  message: data?.message,
                }
              : tool,
          ),
        }));
      } else if (event === "ops_applied") {
        if (registerSelf && typeof data?.opsBatchId === "string") {
          onSelfOpsBatch?.(data.opsBatchId);
        }
        patchMessage(messageId, (message) => ({
          ...message,
          batches: [...message.batches, { ...data, status: "applied" }],
        }));
      } else if (event === "error") {
        patchMessage(messageId, (message) => ({
          ...message,
          error: data?.message ?? data?.code,
          opErrors: Array.isArray(data?.errors) ? data.errors : message.opErrors,
          streaming: false,
        }));
      }
    },
    [onSelfOpsBatch, patchMessage],
  );

  useEffect(() => {
    if (!drawingId) {
      commit(() => []);
      return;
    }
    let active = true;
    setIsLoading(true);
    commit(() => []);
    getAgentChatMessages(drawingId)
      .then((stored) => {
        if (active) commit((current) => mergeMessages(stored.map(toChatMessage), current));
      })
      .catch(() => { /* the panel can still receive live events */ })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [commit, drawingId]);

  useEffect(() => {
    if (!socket || !drawingId) return;
    const onMessage = (payload: any) => {
      if (payload?.drawingId !== drawingId || !payload?.message) return;
      if (payload.clientRequestId === activeRequestIdRef.current) return;
      upsertStoredMessage(payload.message, payload.clientRequestId);
    };
    const onEvent = (payload: any) => {
      if (payload?.drawingId !== drawingId || typeof payload?.messageId !== "string") return;
      if (payload.clientRequestId === activeRequestIdRef.current) return;
      applyEvent(payload.messageId, payload.event, payload.data);
    };
    socket.on("ai-chat-message", onMessage);
    socket.on("ai-chat-event", onEvent);
    return () => {
      socket.off("ai-chat-message", onMessage);
      socket.off("ai-chat-event", onEvent);
    };
  }, [applyEvent, drawingId, socket, upsertStoredMessage]);

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!drawingId || text.length === 0 || streamingRef.current) return;

      const requestId = crypto.randomUUID();
      activeRequestIdRef.current = requestId;
      const createdAt = new Date().toISOString();

      const userMessage: ChatMessage = {
        id: `local:${requestId}:user`,
        role: "user",
        text,
        batches: [],
        tools: [],
        streaming: false,
        clientRequestId: requestId,
        createdAt,
      };
      let assistantId = `local:${requestId}:assistant`;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        batches: [],
        tools: [],
        streaming: true,
        createdAt: new Date(Date.now() + 1).toISOString(),
      };

      commit((current) => mergeMessages(current, [userMessage, assistantMessage]));

      streamingRef.current = true;
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        let canvas: AgentCanvasCapture = { state: "unavailable" };
        try {
          canvas = (await captureCanvasContext?.()) ?? canvas;
        } catch { /* structural state remains available */ }
        await streamAgentChat(
        {
          drawingId,
          providerId,
          message: text,
          clientRequestId: requestId,
          model,
          reasoningEffort,
          canvasImage: canvas.imageDataUrl,
          canvasState: canvas.state,
          signal: controller.signal,
        },
        {
          onMessage: (stored) => {
            if (stored.role === "assistant") assistantId = stored.id;
            upsertStoredMessage(stored, requestId);
          },
          onThinking: (chunk) =>
            applyEvent(assistantId, "thinking", { text: chunk }),
          onToken: (chunk) =>
            applyEvent(assistantId, "token", { text: chunk }),
          onToolCall: (call) =>
            applyEvent(assistantId, "tool_call", call),
          onToolResult: (result) =>
            applyEvent(assistantId, "tool_result", result),
          onOpsApplied: (event: OpsAppliedEvent) =>
            applyEvent(assistantId, "ops_applied", event, true),
          onError: (error: AgentChatError) =>
            applyEvent(assistantId, "error", error),
        },
        );
      } finally {
        streamingRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
        if (activeRequestIdRef.current === requestId) activeRequestIdRef.current = null;
        setIsStreaming(false);
        patchMessage(assistantId, (m) => ({ ...m, streaming: false }));
      }
    },
    [applyEvent, captureCanvasContext, commit, drawingId, model, patchMessage, providerId, reasoningEffort, upsertStoredMessage],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
    setIsStreaming(false);
    commit((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }, [commit]);

  const setBatchStatus = useCallback(
    (opsBatchId: string, status: BatchStatus) => {
      commit((prev) =>
        prev.map((m) => ({
          ...m,
          batches: m.batches.map((b) =>
            b.opsBatchId === opsBatchId ? { ...b, status } : b,
          ),
        })),
      );
    },
    [commit],
  );

  const undoBatch = useCallback(
    async (batch: ChatBatch) => {
      if (!drawingId || batch.status === "reverting" || batch.status === "reverted") {
        return;
      }
      setBatchStatus(batch.opsBatchId, "reverting");
      try {
        const result = await revertOpsBatch(drawingId, batch.revertVersion);
        onSelfOpsBatch?.(result.opsBatchId);
        setBatchStatus(batch.opsBatchId, "reverted");
      } catch {
        setBatchStatus(batch.opsBatchId, "revert-failed");
      }
    },
    [drawingId, onSelfOpsBatch, setBatchStatus],
  );

  const clear = useCallback(() => {
    if (streamingRef.current) return;
    commit(() => []);
  }, [commit]);

  return useMemo(
    () => ({ messages, isStreaming, isLoading, sendMessage, stop, undoBatch, clear }),
    [messages, isStreaming, isLoading, sendMessage, stop, undoBatch, clear],
  );
};
