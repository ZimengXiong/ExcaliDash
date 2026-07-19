import React from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { AgentToolActivity } from "./useAgentChat";

const LABELS: Record<string, string> = {
  view_canvas: "Read canvas",
  apply_ops: "Edit canvas",
};

export const AgentToolActivityList: React.FC<{
  tools: AgentToolActivity[];
}> = ({ tools }) => (
  <ul className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
    {tools.map((tool) => (
      <li key={tool.id} className="flex items-center gap-1.5">
        {tool.status === "running" ? (
          <Loader2 size={12} className="shrink-0 animate-spin" />
        ) : tool.status === "success" ? (
          <CheckCircle2 size={12} className="shrink-0 text-emerald-500" />
        ) : (
          <AlertCircle size={12} className="shrink-0 text-amber-500" />
        )}
        <span>{LABELS[tool.name] ?? tool.name}</span>
        {tool.status === "error" && tool.message ? (
          <span className="truncate">— {tool.message}</span>
        ) : null}
      </li>
    ))}
  </ul>
);
