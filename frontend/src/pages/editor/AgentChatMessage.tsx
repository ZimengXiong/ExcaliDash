import React from "react";
import { AlertTriangle, Loader2, Undo2 } from "lucide-react";
import clsx from "clsx";
import type { ChatBatch, ChatMessage } from "./useAgentChat";
import { AgentToolActivityList } from "./AgentToolActivityList";
import { AgentThinkingTrace } from "./AgentThinkingTrace";

const BatchCard: React.FC<{ batch: ChatBatch; onUndo: (batch: ChatBatch) => void }> = ({ batch, onUndo }) => {
  const lines = batch.summaryDelta.filter((line) => line.trim());
  return (
    <div className="mt-2 rounded-xl border-2 border-indigo-200 bg-indigo-50/70 p-2.5 text-xs dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-indigo-700 dark:text-indigo-300">Applied to canvas</span>
        <button type="button" onClick={() => onUndo(batch)} disabled={batch.status === "reverting" || batch.status === "reverted"} className="inline-flex items-center gap-1 rounded-lg border-2 border-indigo-200 bg-white px-2 py-0.5 font-bold text-indigo-700 transition-colors hover:border-indigo-400 disabled:opacity-50 dark:border-indigo-900 dark:bg-neutral-900 dark:text-indigo-300 dark:hover:border-indigo-700">
          {batch.status === "reverting" ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
          {batch.status === "reverting" ? "Undoing…" : batch.status === "reverted" ? "Undone" : batch.status === "revert-failed" ? "Undo failed — retry" : "Undo"}
        </button>
      </div>
      {lines.length ? (
        <ul className="mt-1.5 space-y-0.5 text-gray-600 dark:text-gray-400">
          {lines.slice(0, 8).map((line, index) => <li key={index} className="truncate font-mono">{line}</li>)}
          {lines.length > 8 ? <li>+{lines.length - 8} more</li> : null}
        </ul>
      ) : <p className="mt-1 text-gray-500 dark:text-gray-400">Updated the canvas</p>}
    </div>
  );
};

export const AgentChatMessage: React.FC<{
  message: ChatMessage;
  onUndo: (batch: ChatBatch) => void;
}> = ({ message, onUndo }) => {
  const isUser = message.role === "user";
  return (
    <div className={clsx("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={clsx("max-w-[88%] rounded-2xl border-2 px-3 py-2 text-sm", isUser ? "rounded-br-md border-black bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:border-neutral-600" : "rounded-bl-md border-slate-200 bg-white text-slate-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100")}>
        {isUser && message.author?.name ? (
          <p className="mb-1 text-[10px] font-medium text-indigo-100">
            {message.author.name}
          </p>
        ) : null}
        {!isUser && message.thinking ? (
          <AgentThinkingTrace text={message.thinking} streaming={message.streaming} />
        ) : null}
        {message.text ? <p className="whitespace-pre-wrap break-words">{message.text}</p> : message.streaming && !message.error ? (
          <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><Loader2 size={14} className="animate-spin" />Thinking…</span>
        ) : null}
        {!isUser && message.tools?.length ? <AgentToolActivityList tools={message.tools} /> : null}
        {!isUser ? message.batches.map((batch) => <BatchCard key={batch.opsBatchId} batch={batch} onUndo={onUndo} />) : null}
        {message.error ? (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg border-2 border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0"><p className="break-words">{message.error}</p>{message.opErrors?.map((error, index) => <p key={index}>#{error.opIndex}: {error.message}</p>)}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
