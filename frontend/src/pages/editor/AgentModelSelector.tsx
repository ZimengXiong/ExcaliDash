import React from "react";
import type { AiModelOption, AiProviderProfile } from "../../api/ai";

const selectClass =
  "min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100";

export const AgentModelSelector: React.FC<{
  providers: AiProviderProfile[];
  providerId: string;
  models: AiModelOption[];
  modelId: string;
  reasoningEfforts: string[];
  reasoningEffort: string;
  disabled: boolean;
  onProviderChange: (id: string) => void;
  onModelChange: (id: string) => void;
  onReasoningChange: (effort: string) => void;
}> = ({
  providers,
  providerId,
  models,
  modelId,
  reasoningEfforts,
  reasoningEffort,
  disabled,
  onProviderChange,
  onModelChange,
  onReasoningChange,
}) => (
  <div className="space-y-2 border-b border-gray-200 px-3 py-2 dark:border-neutral-800">
    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
      <span className="w-14 shrink-0 font-medium">Provider</span>
      <select value={providerId} onChange={(e) => onProviderChange(e.target.value)} disabled={disabled} className={selectClass}>
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>{provider.label}</option>
        ))}
      </select>
    </label>
    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
      <span className="w-14 shrink-0 font-medium">Model</span>
      <select value={modelId} onChange={(e) => onModelChange(e.target.value)} disabled={disabled} className={selectClass}>
        {models.map((model) => (
          <option key={model.id} value={model.id}>{model.label}</option>
        ))}
      </select>
    </label>
    {reasoningEfforts.length > 0 ? (
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <span className="w-14 shrink-0 font-medium">Thinking</span>
        <select value={reasoningEffort} onChange={(e) => onReasoningChange(e.target.value)} disabled={disabled} className={selectClass}>
          {reasoningEfforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
        </select>
      </label>
    ) : null}
  </div>
);
