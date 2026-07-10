import React from "react";
import { Sparkles } from "lucide-react";
import type { AiProvider } from "./useAiSettings";

type AiSettingsCardProps = {
  loading: boolean;
  saving: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  status: {
    available: boolean;
    provider: AiProvider;
    model: string | null;
    keyConfigured: boolean;
    keySource: "env" | "db" | null;
  } | null;
  envKeyConfigured: boolean;
  dbKeyConfigured: boolean;
  onProviderChange: (value: AiProvider) => void;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  onClearDbKey: () => void | Promise<void>;
};

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: "disabled", label: "Disabled" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
];

const inputClass =
  "w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none";
const labelClass =
  "block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2";

export const AiSettingsCard: React.FC<AiSettingsCardProps> = ({
  loading,
  saving,
  provider,
  baseUrl,
  model,
  apiKey,
  status,
  envKeyConfigured,
  dbKeyConfigured,
  onProviderChange,
  onBaseUrlChange,
  onModelChange,
  onApiKeyChange,
  onSave,
  onClearDbKey,
}) => (
  <div className="mb-6 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-4 sm:p-6">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-12 h-12 bg-slate-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-slate-200 dark:border-neutral-700">
        <Sparkles size={24} className="text-slate-700 dark:text-neutral-200" />
      </div>
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">AI Assistant</h2>
        <p className="text-sm text-slate-600 dark:text-neutral-400 font-medium">
          Configure the AI chat proxy. The provider key is stored server-side only.
        </p>
      </div>
      {loading && (
        <span className="ml-auto text-sm text-slate-500 dark:text-neutral-500 font-medium">
          Loading…
        </span>
      )}
    </div>

    {status && (
      <div className="mb-4 text-sm font-medium">
        <span
          className={
            status.available
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-slate-500 dark:text-neutral-400"
          }
        >
          {status.available
            ? `Available — ${status.provider} / ${status.model ?? "default"}`
            : "Not available (provider or key missing)"}
        </span>
      </div>
    )}

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div>
        <label className={labelClass}>Provider</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as AiProvider)}
          className={inputClass}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Model</label>
        <input
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder="claude-opus-4-8 / gpt-4o"
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Base URL (optional)</label>
        <input
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className={inputClass}
        />
      </div>
    </div>

    <div className="mt-4">
      <label className={labelClass}>API key</label>
      {envKeyConfigured ? (
        <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">
          A key is provided via the AI_API_KEY environment variable and always takes
          precedence — it cannot be overridden here.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={dbKeyConfigured ? "•••••••• (stored — leave blank to keep)" : "Enter provider API key"}
            className={inputClass}
            autoComplete="off"
          />
          {dbKeyConfigured && (
            <button
              type="button"
              onClick={() => void onClearDbKey()}
              disabled={saving}
              className="px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all disabled:opacity-60 flex-shrink-0"
            >
              Clear key
            </button>
          )}
        </div>
      )}
    </div>

    <div className="mt-4 flex justify-end">
      <button
        onClick={() => void onSave()}
        disabled={saving}
        className="px-5 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save AI settings"}
      </button>
    </div>
  </div>
);
