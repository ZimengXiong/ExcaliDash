import React, { useState } from "react";
import { Brain } from "lucide-react";

export const AgentThinkingTrace: React.FC<{
  text: string;
  streaming: boolean;
}> = ({ text, streaming }) => {
  const [open, setOpen] = useState(streaming);
  return <details
    className="mb-2 rounded-lg border border-violet-200/80 bg-violet-50/60 text-xs dark:border-violet-900/60 dark:bg-violet-950/20"
    open={open}
    onToggle={(event) => setOpen(event.currentTarget.open)}
  >
    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 font-medium text-violet-700 dark:text-violet-300">
      <Brain size={13} />
      Thinking summary
      {streaming ? (
        <span className="ml-auto text-[10px] font-normal text-violet-500 dark:text-violet-400">
          live
        </span>
      ) : null}
    </summary>
    <p className="whitespace-pre-wrap break-words border-t border-violet-200/70 px-2.5 py-2 leading-relaxed text-gray-600 dark:border-violet-900/50 dark:text-gray-400">
      {text}
    </p>
  </details>;
};
