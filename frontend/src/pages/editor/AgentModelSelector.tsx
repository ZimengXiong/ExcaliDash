import React from "react";
import type { AiModelOption, AiProviderProfile } from "../../api/ai";

const selectClass =
  "ui-input min-w-0 w-full appearance-none py-1.5 pl-2.5 pr-6 text-xs font-bold";

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
  <div className="grid grid-cols-2 gap-2 border-b-2 border-slate-100 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
    <label className="min-w-0">
      <span className="ui-field-label mb-1 block">Provider</span>
      <select value={providerId} onChange={(e) => onProviderChange(e.target.value)} disabled={disabled} className={selectClass}>
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>{provider.label}</option>
        ))}
      </select>
    </label>
    <label className="min-w-0">
      <span className="ui-field-label mb-1 block">Model</span>
      <select value={modelId} onChange={(e) => onModelChange(e.target.value)} disabled={disabled} className={selectClass}>
        {models.map((model) => (
          <option key={model.id} value={model.id}>{model.label}</option>
        ))}
      </select>
    </label>
    {reasoningEfforts.length > 0 ? (
      <label className="col-span-2 min-w-0">
        <span className="ui-field-label mb-1 block">Thinking</span>
        <select value={reasoningEffort} onChange={(e) => onReasoningChange(e.target.value)} disabled={disabled} className={selectClass}>
          {reasoningEfforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
        </select>
      </label>
    ) : null}
  </div>
);
