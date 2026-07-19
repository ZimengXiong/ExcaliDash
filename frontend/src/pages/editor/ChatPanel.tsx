import React, { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";
import { Send, Sparkles, Square, Trash2, X } from "lucide-react";
import {
  getAiStatus,
  type AiModelOption,
  type AiProviderProfile,
} from "../../api/ai";
import {
  getChatGptStatus,
  type ChatGptConnectionStatus,
} from "../../api/chatgpt";
import { ChatGptConnect } from "./ChatGptConnect";
import { useAgentChat } from "./useAgentChat";
import { AgentModelSelector } from "./AgentModelSelector";
import { AgentChatMessage } from "./AgentChatMessage";
import type { AgentCanvasCapture } from "./captureAgentCanvas";
import { useAuth } from "../../context/AuthContext";

const STR = {
  title: "Assistant",
  open: "Open canvas assistant",
  close: "Close assistant",
  placeholder: "Ask me to draw or edit something…",
  inputLabel: "Message the assistant",
  send: "Send",
  stop: "Stop",
  clear: "Clear chat",
  empty: "What should I draw?",
} as const;

const CHAT_SELECTION_STORAGE_KEY = "excalidash:ai-chat-selection";

const loadChatSelection = (): { providerId: string; modelId: string } => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CHAT_SELECTION_STORAGE_KEY) ?? "{}",
    );
    return {
      providerId: typeof parsed.providerId === "string" ? parsed.providerId : "",
      modelId: typeof parsed.modelId === "string" ? parsed.modelId : "",
    };
  } catch {
    return { providerId: "", modelId: "" };
  }
};

type ChatPanelProps = {
  drawingId?: string;
  canView: boolean;
  canEdit: boolean;
  socket?: Socket | null;
  selfAgentBatchIdsRef: MutableRefObject<Set<string>>;
  captureCanvasContext?: () => Promise<AgentCanvasCapture>;
};

export const ChatPanel: React.FC<ChatPanelProps> = ({
  drawingId,
  canView,
  canEdit,
  socket,
  selfAgentBatchIdsRef,
  captureCanvasContext,
}) => {
  const initialSelection = useRef(loadChatSelection());
  const { aiEnabled } = useAuth();
  const [available, setAvailable] = useState(false);
  const [providers, setProviders] = useState<AiProviderProfile[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState(
    initialSelection.current.providerId,
  );
  const [chatgpt, setChatgpt] = useState<ChatGptConnectionStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    initialSelection.current.modelId,
  );
  const [reasoningEffort, setReasoningEffort] = useState("medium");
  const listRef = useRef<HTMLDivElement>(null);
  const selectedProvider = providers.find(
    (profile) => profile.id === selectedProviderId,
  );
  const isChatGpt = selectedProvider?.provider === "chatgpt";
  const models: AiModelOption[] = isChatGpt
    ? (chatgpt?.models ?? selectedProvider?.models ?? [])
    : (selectedProvider?.models ?? []);
  const selectedModelOption = models.find(
    (model) => model.id === selectedModel,
  );
  const reasoningEfforts = selectedModelOption?.reasoningEfforts ?? [];

  const registerSelfBatch = useCallback(
    (opsBatchId: string) => {
      if (opsBatchId) selfAgentBatchIdsRef.current.add(opsBatchId);
    },
    [selfAgentBatchIdsRef],
  );

  const { messages, isStreaming, isLoading, sendMessage, stop, undoBatch, clear } =
    useAgentChat({
      drawingId,
      providerId: selectedProviderId || undefined,
      model: selectedModel || undefined,
      reasoningEffort:
        reasoningEfforts.length > 0 ? reasoningEffort : undefined,
      socket,
      captureCanvasContext,
      onSelfOpsBatch: registerSelfBatch,
    });

  const refreshChatGpt = useCallback(() => {
    getChatGptStatus()
      .then(setChatgpt)
      .catch(() => setChatgpt(null));
  }, []);

  useEffect(() => {
    if (!aiEnabled || !canView || !drawingId) {
      setAvailable(false);
      setIsOpen(false);
      stop();
      return;
    }
    let active = true;
    getAiStatus()
      .then((status) => {
        if (!active) return;
        setAvailable(status.available);
        const listedProviders = status.providers?.length
          ? status.providers
          : [
              {
                id: "legacy",
                label: status.provider,
                provider: status.provider,
                available: status.available,
                enabled: status.provider !== "disabled",
                baseUrl: null,
                models: status.model
                  ? [
                      {
                        id: status.model,
                        label: status.model,
                        reasoningEfforts: [],
                      },
                    ]
                  : [],
                customModels: [],
                keyConfigured: status.keyConfigured,
                keySource: status.keySource,
              },
            ];
        const selectable = listedProviders.filter(
          (profile) =>
            profile.enabled &&
            (profile.available || profile.provider === "chatgpt"),
        );
        setProviders(selectable);
        setSelectedProviderId((current) =>
          selectable.some((profile) => profile.id === current)
            ? current
            : (status.defaultProviderId ?? selectable[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [aiEnabled, canView, drawingId, refreshChatGpt, stop]);

  useEffect(() => {
    if (isChatGpt) refreshChatGpt();
  }, [isChatGpt, refreshChatGpt]);

  useEffect(() => {
    if (!models.some((model) => model.id === selectedModel)) {
      setSelectedModel(models[0]?.id ?? "");
    }
  }, [models, selectedModel]);

  useEffect(() => {
    if (
      !selectedProviderId ||
      !selectedModel ||
      !models.some((model) => model.id === selectedModel)
    ) {
      return;
    }
    try {
      window.localStorage.setItem(
        CHAT_SELECTION_STORAGE_KEY,
        JSON.stringify({
          providerId: selectedProviderId,
          modelId: selectedModel,
        }),
      );
    } catch {
      // Preferences remain usable for this session when storage is unavailable.
    }
  }, [models, selectedModel, selectedProviderId]);

  useEffect(() => {
    if (
      reasoningEfforts.length > 0 &&
      !reasoningEfforts.includes(reasoningEffort)
    ) {
      setReasoningEffort(
        reasoningEfforts.includes("medium") ? "medium" : reasoningEfforts[0],
      );
    }
  }, [reasoningEffort, reasoningEfforts]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const text = draft.trim();
      if (!canEdit || !text || isStreaming) return;
      setDraft("");
      void sendMessage(text);
    },
    [canEdit, draft, isStreaming, sendMessage],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit(event);
      }
    },
    [handleSubmit],
  );

  const handleClear = useCallback(() => {
    if (
      messages.length === 0 ||
      isStreaming ||
      !window.confirm("Clear this drawing's shared assistant chat?")
    ) {
      return;
    }
    void clear();
  }, [clear, isStreaming, messages.length]);

  if (
    !aiEnabled ||
    !canView ||
    (!available && messages.length === 0 && !isLoading)
  )
    return null;

  // With the ChatGPT (subscription) provider the panel stays visible even when
  // the user hasn't linked their account — it shows a Connect flow instead of
  // the chat until a usable connection exists.
  const needsConnect = canEdit && isChatGpt && !chatgpt?.connected;

  if (!isOpen) {
    return (
      <button
        type="button"
        aria-label={STR.open}
        title={STR.open}
        onClick={() => setIsOpen(true)}
        className="ui-button-primary fixed bottom-20 right-4 z-40 h-12 w-12 p-0 sm:right-5"
      >
        <Sparkles size={22} />
      </button>
    );
  }

  return (
    <aside
      className="ui-card fixed inset-2 z-40 ml-auto flex w-auto flex-col overflow-hidden sm:inset-y-3 sm:left-auto sm:right-3 sm:w-[25rem]"
      aria-label={STR.title}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b-2 border-slate-100 px-3.5 dark:border-neutral-800">
        <span className="font-display text-xl text-slate-900 dark:text-white">
          {STR.title}
        </span>
        <div className="flex items-center gap-1">
          {canEdit && messages.length > 0 ? (
            <button
              type="button"
              aria-label={STR.clear}
              title={STR.clear}
              onClick={handleClear}
              disabled={isStreaming || isLoading}
              className="ui-icon-button text-slate-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
            >
              <Trash2 size={17} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={STR.close}
            title={STR.close}
            onClick={() => setIsOpen(false)}
            className="ui-icon-button"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {needsConnect ? (
        <div className="flex-1 overflow-y-auto" data-testid="chatgpt-connect">
          <ChatGptConnect
            needsReconnect={Boolean(chatgpt?.needsReconnect)}
            onConnected={setChatgpt}
          />
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-3.5 dark:bg-neutral-950/25"
            data-testid="chat-messages"
          >
            {messages.length === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
                <p className="font-display text-xl text-slate-600 dark:text-neutral-300">
                  {STR.empty}
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <AgentChatMessage
                  key={message.id}
                  message={message}
                  onUndo={undoBatch}
                />
              ))
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t-2 border-slate-100 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            {canEdit && providers.length > 0 ? (
              <AgentModelSelector
                providers={providers}
                providerId={selectedProviderId}
                models={models}
                modelId={selectedModel}
                reasoningEfforts={reasoningEfforts}
                reasoningEffort={reasoningEffort}
                disabled={isStreaming}
                onProviderChange={setSelectedProviderId}
                onModelChange={setSelectedModel}
                onReasoningChange={setReasoningEffort}
              />
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={
                  canEdit ? STR.placeholder : "You have view-only access"
                }
                aria-label={STR.inputLabel}
                disabled={!canEdit}
                className="ui-input max-h-32 min-h-11 flex-1 resize-none"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  title={STR.stop}
                  aria-label={STR.stop}
                  className="ui-button-secondary h-11 w-11 border-red-200 p-0 text-red-600 hover:border-red-300 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canEdit || draft.trim().length === 0}
                  title={STR.send}
                  aria-label={STR.send}
                  className="ui-button-primary h-11 w-11 p-0"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </aside>
  );
};
