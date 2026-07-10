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
    <div className="mt-2 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 p-2.5 text-xs">
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
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
          isUser
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-gray-100 rounded-bl-sm",
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

  useEffect(() => {
    if (!canEdit || !drawingId) {
      setAvailable(false);
      return;
    }
    let active = true;
    getAiStatus()
      .then((status) => {
        if (active) setAvailable(status.available);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [canEdit, drawingId]);

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

  if (!isOpen) {
    return (
      <button
        type="button"
        aria-label={STR.open}
        title={STR.open}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-500 transition-colors"
      >
        <Sparkles size={22} />
      </button>
    );
  }

  return (
    <aside
      className="fixed top-0 right-0 z-40 flex h-screen w-full max-w-sm flex-col border-l border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl"
      aria-label={STR.title}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 dark:border-neutral-800 px-4">
        <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
          <Sparkles size={18} className="text-indigo-500" />
          {STR.title}
        </span>
        <button
          type="button"
          aria-label={STR.close}
          onClick={() => setIsOpen(false)}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <X size={18} />
        </button>
      </header>

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto p-4"
        data-testid="chat-messages"
      >
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {STR.empty}
          </p>
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
        className="shrink-0 border-t border-gray-200 dark:border-neutral-800 p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={STR.placeholder}
            aria-label={STR.placeholder}
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              title={STR.stop}
              aria-label={STR.stop}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-200 dark:bg-neutral-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-neutral-600 transition-colors"
            >
              <Loader2 size={18} className="animate-spin" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              title={STR.send}
              aria-label={STR.send}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-default transition-colors"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </form>
    </aside>
  );
};
