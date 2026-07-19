import React from "react";
import { PlugZap, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { AiProviderDefinition, AiStatus } from "../../api/ai";
import type { AiProviderDraft, ConfigurableAiProvider } from "./useAiSettings";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white";
const labelClass =
  "mb-1 block text-xs font-bold text-slate-600 dark:text-neutral-400";

const ProviderEditor: React.FC<{
  profile: AiProviderDraft;
  providerDefinitions: AiProviderDefinition[];
  saving: boolean;
  onChange: (patch: Partial<AiProviderDraft>) => void;
  onRemove: () => void;
  onDiscover: (refresh?: boolean) => void;
  onTest: () => void;
}> = ({
  profile,
  providerDefinitions,
  saving,
  onChange,
  onRemove,
  onDiscover,
  onTest,
}) => {
  const definition = providerDefinitions.find(
    (item) => item.id === profile.provider,
  );
  const selectedModel = profile.modelsText.split(",")[0]?.trim() ?? "";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-neutral-700 dark:bg-neutral-800/30 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4 dark:border-neutral-700">
        <div className="min-w-[220px] max-w-sm flex-1">
          <label className={labelClass}>Display name</label>
          <input
            value={profile.label}
            onChange={(event) => onChange({ label: event.target.value })}
            aria-label="Provider label"
            className={`${inputClass} font-semibold`}
          />
        </div>
        <label className="mt-5 flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={profile.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          Enabled
        </label>
        <button
          type="button"
          onClick={onRemove}
          disabled={saving}
          aria-label={`Remove ${profile.label}`}
          className="mt-5 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
        >
          <Trash2 size={18} />
        </button>
      </div>
      <div className="grid max-w-3xl grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
        <div className="md:max-w-xs">
          <label className={labelClass}>Provider type</label>
          <select
            value={profile.provider}
            onChange={(event) =>
              onChange({
                provider: event.target.value as ConfigurableAiProvider,
              })
            }
            className={inputClass}
          >
            {providerDefinitions.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
          {definition?.help ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">
              {definition.help}
            </p>
          ) : null}
        </div>
        {profile.provider === "chatgpt" ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200 md:col-span-2">
            Models, reasoning levels, OAuth endpoints, and the Codex base URL
            are managed automatically. Each user connects their own ChatGPT
            subscription from the canvas chat panel.
          </div>
        ) : (
          <>
            <div className="md:max-w-md">
              <label className={labelClass}>Model</label>
              {profile.discoveredModels.length > 0 ? (
                <select
                  value={selectedModel}
                  onChange={(event) =>
                    onChange({ modelsText: event.target.value })
                  }
                  className={inputClass}
                >
                  {!profile.discoveredModels.some(
                    (model) => model.id === selectedModel,
                  ) && selectedModel ? (
                    <option value={selectedModel}>
                      {selectedModel} (configured)
                    </option>
                  ) : null}
                  {profile.discoveredModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={selectedModel}
                  onChange={(event) =>
                    onChange({ modelsText: event.target.value })
                  }
                  placeholder="Enter a model ID"
                  className={inputClass}
                />
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDiscover(true)}
                  disabled={profile.discovering || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold dark:border-neutral-600 dark:bg-neutral-800"
                >
                  <RefreshCw
                    size={14}
                    className={profile.discovering ? "animate-spin" : ""}
                  />
                  {profile.discovering ? "Refreshing…" : "Refresh models"}
                </button>
                {profile.discoverySource ? (
                  <span className="text-xs text-slate-500">
                    {profile.discoverySource === "live"
                      ? "Live catalog"
                      : profile.discoverySource === "cache"
                        ? "Cached live catalog"
                        : "Built-in fallback"}
                  </span>
                ) : null}
              </div>
              {profile.discoveryWarning ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  {profile.discoveryWarning}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
      {profile.provider !== "chatgpt" ? (
        <div className="mt-4 max-w-3xl">
          <label className={labelClass}>API key</label>
          {profile.keySource === "env" ? (
            <p className="text-sm text-slate-500 dark:text-neutral-400">
              Provided by AI_API_KEY for this migrated profile.
            </p>
          ) : (
            <div className="flex max-w-xl gap-2">
              <input
                type="password"
                value={profile.apiKey}
                onChange={(event) =>
                  onChange({ apiKey: event.target.value, clearApiKey: false })
                }
                placeholder={
                  profile.keyConfigured
                    ? "Stored — leave blank to keep"
                    : "Enter API key"
                }
                autoComplete="off"
                className={inputClass}
              />
              {profile.keyConfigured ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      apiKey: "",
                      keyConfigured: false,
                      clearApiKey: true,
                    })
                  }
                  className="shrink-0 rounded-xl border-2 border-slate-200 px-3 text-sm font-bold dark:border-neutral-700"
                >
                  Clear
                </button>
              ) : null}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onTest}
              disabled={profile.testing || saving}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-black bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60 dark:border-neutral-600"
            >
              <PlugZap size={16} />
              {profile.testing ? "Testing…" : "Test connection"}
            </button>
            {profile.testResult ? (
              <div
                role="status"
                className={`text-sm ${
                  profile.testResult.ok
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-red-700 dark:text-red-300"
                }`}
              >
                <strong>{profile.testResult.message}</strong>
                {profile.testResult.guidance ? (
                  <span className="ml-1 text-slate-600 dark:text-neutral-400">
                    {profile.testResult.guidance}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <details
            className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900"
            open={profile.provider === "custom" ? true : undefined}
          >
            <summary className="cursor-pointer text-sm font-bold text-slate-700 dark:text-neutral-300">
              Advanced
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className={labelClass}>Base URL override</label>
                <input
                  value={profile.baseUrl}
                  onChange={(event) =>
                    onChange({ baseUrl: event.target.value })
                  }
                  placeholder={
                    definition?.baseUrl ?? "https://your-provider.example/v1"
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Manual model IDs (comma-separated)
                </label>
                <input
                  value={profile.modelsText}
                  onChange={(event) =>
                    onChange({ modelsText: event.target.value })
                  }
                  placeholder={definition?.defaultModel ?? "model-id"}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Reasoning levels (optional)
                </label>
                <input
                  value={profile.reasoningEffortsText}
                  onChange={(event) =>
                    onChange({ reasoningEffortsText: event.target.value })
                  }
                  placeholder="low, medium, high"
                  className={inputClass}
                />
              </div>
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
};

export const AiSettingsCard: React.FC<{
  enabled: boolean;
  loading: boolean;
  saving: boolean;
  providers: AiProviderDraft[];
  defaultProviderId: string;
  status: AiStatus | null;
  providerDefinitions: AiProviderDefinition[];
  onDefaultProviderChange: (id: string) => void;
  onAddProvider: () => void;
  onUpdateProvider: (id: string, patch: Partial<AiProviderDraft>) => void;
  onRemoveProvider: (id: string) => void;
  onDiscoverModels: (id: string, refresh?: boolean) => void;
  onTestProvider: (id: string) => void;
  onSave: () => void | Promise<void>;
  onEnabledChange: (value: boolean) => void | Promise<void>;
}> = ({
  enabled,
  loading,
  saving,
  providers,
  defaultProviderId,
  status,
  providerDefinitions,
  onDefaultProviderChange,
  onAddProvider,
  onUpdateProvider,
  onRemoveProvider,
  onDiscoverModels,
  onTestProvider,
  onSave,
  onEnabledChange,
}) => (
  <section className="mx-auto mb-6 w-full max-w-5xl rounded-2xl border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-neutral-700 dark:bg-neutral-900 sm:p-6">
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-slate-200 bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800">
        <Sparkles size={24} />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
          AI provider registry
        </h2>
        <p className="mt-1 max-w-xl text-sm text-slate-600 dark:text-neutral-400">
          Configure the providers and models available to the canvas agent.
        </p>
      </div>
      {loading ? (
        <span className="ml-auto text-sm text-slate-500">Loading…</span>
      ) : null}
    </div>

    <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border-2 border-slate-200 bg-slate-50/60 p-4 dark:border-neutral-700 dark:bg-neutral-800/30">
      <div>
        <p className="text-sm font-bold text-slate-800 dark:text-neutral-100">
          Enable AI features
        </p>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-neutral-400">
          Hides AI controls and blocks AI APIs without deleting saved providers.
        </p>
      </div>
      <PlayfulSwitch
        checked={enabled}
        onChange={onEnabledChange}
        disabled={loading || saving}
        ariaLabel="Enable AI features"
      />
    </div>

    {!enabled ? (
      <p className="text-sm font-medium text-slate-500 dark:text-neutral-400">
        AI features are disabled. Turn them back on to manage the saved provider
        registry.
      </p>
    ) : (
      <>
        <div className="mb-5 max-w-xs">
          <label className={labelClass}>Default provider</label>
          <select
            value={defaultProviderId}
            onChange={(event) => onDefaultProviderChange(event.target.value)}
            className={inputClass}
          >
            {providers.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {providers.map((profile) => (
            <ProviderEditor
              key={profile.id}
              profile={profile}
              providerDefinitions={providerDefinitions}
              saving={saving}
              onChange={(patch) => onUpdateProvider(profile.id, patch)}
              onRemove={() => onRemoveProvider(profile.id)}
              onDiscover={(refresh) => onDiscoverModels(profile.id, refresh)}
              onTest={() => onTestProvider(profile.id)}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onAddProvider}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-black px-4 py-2 text-sm font-bold dark:border-neutral-700"
          >
            <Plus size={16} /> Add provider
          </button>
          <div className="flex items-center gap-3">
            {status ? (
              <span className="text-sm text-slate-500">
                {status.providers.filter((profile) => profile.available).length}{" "}
                available
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="rounded-xl border-2 border-black bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save provider registry"}
            </button>
          </div>
        </div>
      </>
    )}
  </section>
);
