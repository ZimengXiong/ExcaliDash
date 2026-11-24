import React, { useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import * as api from "../../api";
import type { AiChatMessage } from "../../api";
import { applyAiOperations } from "./aiOperations";

type AISidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  drawingId?: string;
  canEdit: boolean;
  excalidrawAPI: React.RefObject<any>;
};

const getErrorMessage = (error: unknown): string => {
  if (api.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string") return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not reach the AI assistant. Please try again.";
};

const mergeIncomingMessages = (
  current: AiChatMessage[],
  incoming: AiChatMessage[],
) => {
  const incomingUserContent = new Set(
    incoming.filter((message) => message.role === "user").map((m) => m.content),
  );
  const withoutOptimisticDuplicates = current.filter(
    (message) =>
      !message.id.startsWith("local-") ||
      !incomingUserContent.has(message.content),
  );
  const knownIds = new Set(withoutOptimisticDuplicates.map((m) => m.id));
  return [
    ...withoutOptimisticDuplicates,
    ...incoming.filter((message) => !knownIds.has(message.id)),
  ];
};

const ThinkingBlock: React.FC<{ text: string; isActive?: boolean }> = ({
  text,
  isActive = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(isActive);
  return (
    <div
      className={`mb-2 rounded-xl border border-indigo-100 bg-indigo-50/60 dark:border-indigo-900/50 dark:bg-indigo-950/20 ${isActive ? "mt-3" : ""}`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-indigo-600 dark:text-indigo-300"
        aria-label="Toggle AI thinking"
        aria-expanded={isExpanded}
      >
        {isActive ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <BrainCircuit size={14} />
        )}
        <span className="flex-1">
          {isActive ? "Kimi is thinking..." : "View thinking"}
        </span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isExpanded && text ? (
        <div className="custom-scrollbar max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-3 pb-3 text-xs leading-5 text-slate-600 dark:text-neutral-400">
          {text}
        </div>
      ) : null}
    </div>
  );
};

export const AISidebar: React.FC<AISidebarProps> = ({
  isOpen,
  onClose,
  drawingId,
  canEdit,
  excalidrawAPI,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveReasoning, setLiveReasoning] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !drawingId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    api
      .getAiConversation(drawingId)
      .then((conversation) => {
        if (!cancelled) setMessages(conversation.messages);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drawingId, isOpen]);

  useEffect(() => {
    if (!isOpen || !drawingId || typeof EventSource === "undefined") return;
    const events = new EventSource(
      `${api.API_URL}/drawings/${drawingId}/ai/events`,
      { withCredentials: true },
    );
    events.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (update.type === "messages" && Array.isArray(update.messages)) {
          setMessages((current) =>
            mergeIncomingMessages(current, update.messages),
          );
        } else if (update.type === "snapshot") {
          setIsSending(Boolean(update.job));
          setLiveReasoning(update.job ? update.job.reasoning : null);
        } else if (update.type === "status") {
          const isWorking = update.status === "working";
          setIsSending(isWorking);
          setLiveReasoning(isWorking ? (update.reasoning ?? "") : null);
        } else if (update.type === "cleared") {
          setMessages([]);
          setLiveReasoning(null);
          setIsSending(false);
        }
      } catch {
        // Ignore malformed individual events; EventSource remains connected.
      }
    };
    return () => events.close();
  }, [drawingId, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending, liveReasoning]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!drawingId || !canEdit || !content || isSending) return;

    const optimisticMessage: AiChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);
    setDraft("");
    setIsSending(true);
    setError(null);
    setLiveReasoning("");
    let response: Awaited<ReturnType<typeof api.streamAiMessage>>;
    try {
      response = await api.streamAiMessage(
        drawingId,
        content,
        () => undefined,
      );
    } catch (sendError) {
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id),
      );
      setDraft(content);
      setError(getErrorMessage(sendError));
      setLiveReasoning(null);
      setIsSending(false);
      return;
    }

    setMessages((current) =>
      mergeIncomingMessages(
        current.filter((message) => message.id !== optimisticMessage.id),
        response.messages,
      ),
    );
    setLiveReasoning(null);
    if (response.operations.length > 0) {
      try {
        if (!excalidrawAPI.current) {
          throw new Error("The editor is not ready");
        }
        applyAiOperations(excalidrawAPI.current, response.operations);
      } catch (applyError) {
        console.error("[AI] Failed to apply board operations", applyError);
        setError(
          "Kimi responded, but the board changes could not be applied. Reload the board before retrying.",
        );
      }
    }
    setIsSending(false);
  };

  const handleNewConversation = async () => {
    if (
      !drawingId ||
      isSending ||
      (messages.length > 0 &&
        !window.confirm(
          "Clear this board's shared AI conversation for everyone?",
        ))
    ) {
      return;
    }
    setError(null);
    try {
      await api.clearAiConversation(drawingId);
      setMessages([]);
      setLiveReasoning(null);
    } catch (clearError) {
      setError(getErrorMessage(clearError));
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      aria-label="AI assistant"
      className="ui-side-panel absolute inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
            <Sparkles size={19} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-neutral-100">
              AI Assistant
            </h2>
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              Kimi K3.1 Pro · High effort
            </p>
          </div>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleNewConversation}
            disabled={!drawingId || !canEdit || isSending}
            className="ui-toolbar-button"
            aria-label="New AI conversation"
            title="New shared conversation"
          >
            <MessageSquarePlus size={18} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ui-toolbar-button"
            aria-label="Close AI assistant"
            title="Close AI assistant"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : messages.length === 0 && liveReasoning === null ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
              <Sparkles size={26} />
            </span>
            <h3 className="text-base font-bold text-slate-900 dark:text-neutral-100">
              What should we create?
            </h3>
            <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500 dark:text-neutral-400">
              Ask AI to create, update, or organize elements on this board.
            </p>
          </div>
        ) : (
          <div className="space-y-3" aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-8 rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2.5 text-sm text-white"
                    : "mr-8 rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800 dark:bg-neutral-800 dark:text-neutral-100"
                }
              >
                {message.reasoning ? (
                  <ThinkingBlock text={message.reasoning} />
                ) : null}
                <p className="whitespace-pre-wrap break-words leading-5">
                  {message.content}
                </p>
              </div>
            ))}
          </div>
        )}
        {liveReasoning !== null ? (
          <ThinkingBlock text={liveReasoning} isActive />
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-200 p-4 dark:border-neutral-800">
        {error ? (
          <p
            className="mb-2 text-xs font-medium text-rose-600 dark:text-rose-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <form
          onSubmit={handleSend}
          className="rounded-xl border-2 border-slate-200 bg-white p-2 focus-within:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800"
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={!canEdit || isSending}
            rows={3}
            maxLength={4000}
            placeholder={
              canEdit
                ? "Ask AI to edit this board..."
                : "Editing access is required to use AI"
            }
            aria-label="Message AI assistant"
            className="w-full resize-none bg-transparent px-2 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
          <div className="flex items-center justify-between gap-3 px-1 pb-1">
            <span className="text-xs text-slate-400 dark:text-neutral-500">
              Shared with this board · Enter to send
            </span>
            <button
              type="submit"
              disabled={!drawingId || !canEdit || !draft.trim() || isSending}
              className="ui-icon-button h-8 w-8 rounded-lg"
              aria-label="Send message"
              title="Send message"
            >
              <Send size={15} />
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
};
