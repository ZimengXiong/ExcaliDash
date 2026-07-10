import { useCallback, useMemo, useRef, useState } from "react";
import {
  revertOpsBatch,
  streamAgentChat,
  type AgentChatError,
  type ChatTurn,
  type OpError,
  type OpsAppliedEvent,
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

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  batches: ChatBatch[];
  opErrors?: OpError[];
  error?: string;
  streaming: boolean;
};

type UseAgentChatArgs = {
  drawingId?: string;
  /**
   * Register an applied batch as self-originated so the collaboration layer
   * replays the incoming socket update with `captureUpdate: IMMEDIATELY`,
   * making the agent edit natively undoable for the requesting user (D5).
   */
  onSelfOpsBatch?: (opsBatchId: string) => void;
};

let idCounter = 0;
const nextId = () => `m${Date.now().toString(36)}_${(idCounter += 1)}`;

const toTurns = (messages: ChatMessage[]): ChatTurn[] =>
  messages
    .filter((m) => m.text.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.text }));

export const useAgentChat = ({ drawingId, onSelfOpsBatch }: UseAgentChatArgs) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  // Mirror of `messages` for synchronous reads (history assembly) that must not
  // wait for a state flush.
  const messagesRef = useRef<ChatMessage[]>([]);

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

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!drawingId || text.length === 0 || streamingRef.current) return;

      const userMessage: ChatMessage = {
        id: nextId(),
        role: "user",
        text,
        batches: [],
        streaming: false,
      };
      const assistantId = nextId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        batches: [],
        streaming: true,
      };

      const history = [...messagesRef.current, userMessage];
      commit(() => [...history, assistantMessage]);

      streamingRef.current = true;
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      await streamAgentChat(
        { drawingId, messages: toTurns(history), signal: controller.signal },
        {
          onToken: (chunk) =>
            patchMessage(assistantId, (m) => ({
              ...m,
              text: m.text ? `${m.text}\n\n${chunk}` : chunk,
            })),
          onOpsApplied: (event: OpsAppliedEvent) => {
            onSelfOpsBatch?.(event.opsBatchId);
            patchMessage(assistantId, (m) => ({
              ...m,
              batches: [
                ...m.batches,
                {
                  opsBatchId: event.opsBatchId,
                  version: event.version,
                  revertVersion: event.revertVersion,
                  summaryDelta: event.summaryDelta,
                  status: "applied",
                },
              ],
            }));
          },
          onError: (error: AgentChatError) =>
            patchMessage(assistantId, (m) => ({
              ...m,
              error: error.message ?? error.code,
              opErrors: error.errors,
            })),
        },
      );

      streamingRef.current = false;
      abortRef.current = null;
      setIsStreaming(false);
      patchMessage(assistantId, (m) => ({ ...m, streaming: false }));
    },
    [drawingId, onSelfOpsBatch, patchMessage],
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
    () => ({ messages, isStreaming, sendMessage, stop, undoBatch, clear }),
    [messages, isStreaming, sendMessage, stop, undoBatch, clear],
  );
};
