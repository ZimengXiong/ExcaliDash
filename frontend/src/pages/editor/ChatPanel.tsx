import React, { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  AlertTriangle,
  Loader2,
  Send,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { getAiStatus } from "../../api/ai";
import {
  getChatGptStatus,
  type ChatGptConnectionStatus,
} from "../../api/chatgpt";
import { ChatGptConnect } from "./ChatGptConnect";
import { useAgentChat, type ChatBatch, type ChatMessage } from "./useAgentChat";

const STR = {
  title: "Canvas assistant",
  open: "Open canvas assistant",
  close: "Close assistant",
  placeholder: "Ask the assistant to change the canvas…",
  send: "Send",
  stop: "Stop",
  empty:
    "Describe what you want on the canvas and the assistant will draw it for you.",
  thinking: "Thinking…",
  applied: "Applied to canvas",
  undo: "Undo",
  undoing: "Undoing…",
  reverted: "Undone",
  undoFailed: "Undo failed — retry",
  noChanges: "Updated the canvas",
} as const;

type ChatPanelProps = {
  drawingId?: string;
  canEdit: boolean;
  selfAgentBatchIdsRef: MutableRefObject<Set<string>>;
};

const BatchCard: React.FC<{
  batch: ChatBatch;
  onUndo: (batch: ChatBatch) => void;
}> = ({ batch, onUndo }) => {
  const lines = batch.summaryDelta.filter((l) => l.trim().length > 0);
  return (
    <div className="mt-2 rounded-xl border-2 border-indigo-200 bg-indigo-50/70 p-2.5 text-xs dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-indigo-700 dark:text-indigo-300">
          {STR.applied}
        </span>
        <button
          type="button"
          onClick={() => onUndo(batch)}
          disabled={batch.status === "reverting" || batch.status === "reverted"}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50 disabled:cursor-default transition-colors"
        >
          {batch.status === "reverting" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Undo2 size={12} />
          )}
          {batch.status === "reverting"
            ? STR.undoing
            : batch.status === "reverted"
              ? STR.reverted
              : batch.status === "revert-failed"
                ? STR.undoFailed
                : STR.undo}
        </button>
      </div>
      {lines.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-gray-600 dark:text-gray-400">
          {lines.slice(0, 8).map((line, i) => (
            <li key={i} className="truncate font-mono">
              {line}
            </li>
          ))}
          {lines.length > 8 ? <li>+{lines.length - 8} more</li> : null}
        </ul>
      ) : (
        <p className="mt-1 text-gray-500 dark:text-gray-400">{STR.noChanges}</p>
      )}
    </div>
  );
};

const MessageBubble: React.FC<{
  message: ChatMessage;
  onUndo: (batch: ChatBatch) => void;
}> = ({ message, onUndo }) => {
  const isUser = message.role === "user";
  return (
    <div className={clsx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[88%] rounded-2xl border-2 px-3 py-2 text-sm",
          isUser
            ? "rounded-br-md border-black bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-neutral-600"
            : "rounded-bl-md border-slate-200 bg-white text-slate-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100",
        )}
      >
        {message.text ? (
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        ) : message.streaming && !message.error ? (
          <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <Loader2 size={14} className="animate-spin" />
            {STR.thinking}
          </span>
        ) : null}
        {!isUser
          ? message.batches.map((batch) => (
              <BatchCard key={batch.opsBatchId} batch={batch} onUndo={onUndo} />
            ))
          : null}
        {message.error ? (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 p-2 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="break-words">{message.error}</p>
              {message.opErrors?.length ? (
                <ul className="mt-1 space-y-0.5">
                  {message.opErrors.map((e, i) => (
                    <li key={i} className="break-words">
                      #{e.opIndex}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const ChatPanel: React.FC<ChatPanelProps> = ({
  drawingId,
  canEdit,
  selfAgentBatchIdsRef,
}) => {
  const [available, setAvailable] = useState(false);
  const [isChatGpt, setIsChatGpt] = useState(false);
  const [chatgpt, setChatgpt] = useState<ChatGptConnectionStatus | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const registerSelfBatch = useCallback(
    (opsBatchId: string) => {
      if (opsBatchId) selfAgentBatchIdsRef.current.add(opsBatchId);
    },
    [selfAgentBatchIdsRef],
  );

  const { messages, isStreaming, sendMessage, stop, undoBatch } = useAgentChat({
    drawingId,
    onSelfOpsBatch: registerSelfBatch,
  });

  const refreshChatGpt = useCallback(() => {
    getChatGptStatus()
      .then(setChatgpt)
      .catch(() => setChatgpt(null));
  }, []);

  useEffect(() => {
    if (!canEdit || !drawingId) {
      setAvailable(false);
      return;
    }
    let active = true;
    getAiStatus()
      .then((status) => {
        if (!active) return;
        setAvailable(status.available);
        const chatgptProvider = status.provider === "chatgpt";
        setIsChatGpt(chatgptProvider);
        if (chatgptProvider && status.available) refreshChatGpt();
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [canEdit, drawingId, refreshChatGpt]);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text || isStreaming) return;
      setDraft("");
      void sendMessage(text);
    },
    [draft, isStreaming, sendMessage],
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

  if (!available) return null;

  // With the ChatGPT (subscription) provider the panel stays visible even when
  // the user hasn't linked their account — it shows a Connect flow instead of
  // the chat until a usable connection exists.
  const needsConnect = isChatGpt && !chatgpt?.connected;

  if (!isOpen) {
    return (
      <button
        type="button"
        aria-label={STR.open}
        title={STR.open}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-black bg-indigo-500 text-white shadow-[3px_3px_0_0_#000] transition-all hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_#000] dark:border-neutral-600 dark:bg-indigo-500"
      >
        <Sparkles size={22} />
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-3 right-3 z-40 flex w-[calc(100%-1.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[6px_6px_0_0_#000] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[6px_6px_0_0_rgba(255,255,255,0.14)]"
      aria-label={STR.title}
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b-2 border-slate-100 px-4 dark:border-neutral-800">
        <span className="flex items-center gap-3 font-bold text-gray-900 dark:text-gray-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-black bg-indigo-400 text-black dark:border-neutral-700"><Sparkles size={17} /></span>
          {STR.title}
        </span>
        <button
          type="button"
          aria-label={STR.close}
          onClick={() => setIsOpen(false)}
          className="ui-icon-button h-9 w-9"
        >
          <X size={18} />
        </button>
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
            className="flex-1 space-y-3 overflow-y-auto p-4"
            data-testid="chat-messages"
          >
            {messages.length === 0 ? (
              <div className="mx-auto mt-10 max-w-[15rem] text-center text-sm text-gray-500 dark:text-gray-400">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300"><Sparkles size={21} /></span>
                <p className="font-semibold text-slate-700 dark:text-neutral-200">What should I draw?</p>
                <p className="mt-1 text-xs font-medium">{STR.empty}</p>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onUndo={undoBatch}
                />
              ))
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t-2 border-gray-100 p-3 dark:border-neutral-800"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                maxLength={20_000}
                placeholder={STR.placeholder}
                aria-label={STR.placeholder}
                className="ui-input max-h-32 min-h-[2.75rem] flex-1 resize-none px-3 py-2 text-sm"
              />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              title={STR.stop}
              aria-label={STR.stop}
              className="ui-icon-button h-11 w-11 shrink-0"
            >
              <Loader2 size={18} className="animate-spin" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              title={STR.send}
              aria-label={STR.send}
              className="ui-button-primary h-11 w-11 shrink-0 px-0 disabled:opacity-40"
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
