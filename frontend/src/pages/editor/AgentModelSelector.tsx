import React from "react";
import type { AiModelOption, AiProviderProfile } from "../../api/ai";

const selectClass =
  "ui-input min-w-0 w-full appearance-none py-1.5 pl-2 pr-5 text-[11px] font-bold";

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
  <div className="mb-2 grid grid-cols-3 gap-1.5">
    <label className="min-w-0">
      <span className="sr-only">Provider</span>
      <select value={providerId} onChange={(e) => onProviderChange(e.target.value)} disabled={disabled} className={selectClass}>
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>{provider.label}</option>
        ))}
      </select>
    </label>
    <label className="min-w-0">
      <span className="sr-only">Model</span>
      <select value={modelId} onChange={(e) => onModelChange(e.target.value)} disabled={disabled} className={selectClass}>
        {models.map((model) => (
          <option key={model.id} value={model.id}>{model.label}</option>
        ))}
      </select>
    </label>
    {reasoningEfforts.length > 0 ? (
      <label className="min-w-0">
        <span className="sr-only">Thinking</span>
        <select value={reasoningEffort} onChange={(e) => onReasoningChange(e.target.value)} disabled={disabled} className={selectClass}>
          {reasoningEfforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
        </select>
      </label>
    ) : null}
  </div>
);
