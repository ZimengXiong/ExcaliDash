import React from "react";
import { PlugZap, RefreshCw } from "lucide-react";
import type { AiProviderDefinition } from "../../api/ai";
import { PlayfulSelect } from "../../components/PlayfulSelect";
import type { AiProviderDraft } from "./useAiSettings";

const labelClass =
  "mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400";

export const AiProviderTools: React.FC<{
  profile: AiProviderDraft;
  providerDefinitions: AiProviderDefinition[];
  saving: boolean;
  onChange: (patch: Partial<AiProviderDraft>) => void;
  onDiscover: (refresh?: boolean) => void;
  onTest: () => void;
}> = ({
  profile,
  providerDefinitions,
  saving,
  onChange,
  onDiscover,
  onTest,
}) => {
  const selectedModel = profile.modelsText.split(",")[0]?.trim() ?? "";
  const definition = providerDefinitions.find(
    (item) => item.id === profile.provider,
  );
  const detectedModelOptions = [
    ...(!profile.discoveredModels.some(
      (model) => model.id === selectedModel,
    ) && selectedModel
      ? [{ value: selectedModel, label: `${selectedModel} (configured)` }]
      : []),
    ...profile.discoveredModels.map((model) => ({
      value: model.id,
      label: model.label,
    })),
  ];

  return (
    <div className="mt-4 border-t-2 border-dashed border-slate-200 pt-4 dark:border-neutral-700">
      <h4 className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-neutral-400">
        Provider tools
      </h4>
      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-neutral-400">
        Test this configuration or load the provider&apos;s available models.
        Your manual settings above remain authoritative.
      </p>

      {detectedModelOptions.length > 0 ? (
        <div className="mt-3 max-w-xl">
          <label className={labelClass}>Detected model</label>
          <PlayfulSelect
            ariaLabel="Detected model"
            value={selectedModel}
            onChange={(value) => onChange({ modelsText: value })}
            options={detectedModelOptions}
            className="w-full"
            buttonClassName="w-full px-3 py-2 font-normal"
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onDiscover(true)}
          disabled={profile.discovering || saving}
          className="inline-flex items-center gap-1.5 rounded-lg border-2 border-slate-200 bg-white px-3 py-1.5 text-xs font-bold transition-colors hover:border-slate-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800"
        >
          <RefreshCw
            size={14}
            className={profile.discovering ? "animate-spin" : ""}
          />
          {profile.discovering ? "Refreshing…" : "Refresh models"}
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={profile.testing || saving}
          className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 dark:border-neutral-600"
        >
          <PlugZap size={14} />
          {profile.testing ? "Testing…" : "Test connection"}
        </button>
        {profile.discoverySource ? (
          <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">
            {profile.discoverySource === "live"
              ? "Live catalog"
              : profile.discoverySource === "cache"
                ? "Cached live catalog"
                : profile.discoverySource === "configured"
                  ? "Configured models"
                  : "Built-in fallback"}
          </span>
        ) : null}
      </div>

      {definition?.help ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
          {definition.help}
        </p>
      ) : null}
      {profile.discoveryWarning ? (
        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          {profile.discoveryWarning}
        </p>
      ) : null}
      {profile.testResult ? (
        <p
          role="status"
          className={`mt-2 text-sm font-medium ${
            profile.testResult.ok
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-red-700 dark:text-red-300"
          }`}
        >
          <strong>{profile.testResult.message}</strong>
          {profile.testResult.guidance ? (
            <span className="ml-1 font-normal text-slate-600 dark:text-neutral-400">
              {profile.testResult.guidance}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
};
