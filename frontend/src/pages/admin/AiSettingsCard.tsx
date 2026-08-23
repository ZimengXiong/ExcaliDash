import React from "react";
import { Sparkles } from "lucide-react";
import type { AiProvider } from "./useAiSettings";
import { PlayfulSelect } from "../../components/PlayfulSelect";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";
import {
  SettingsCard,
  SettingsSectionHeader,
} from "../settings/SettingsRow";

type AiSettingsCardProps = {
  loading: boolean;
  saving: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  chatgptEnabled: boolean;
  status: {
    available: boolean;
    provider: AiProvider;
    model: string | null;
    keyConfigured: boolean;
    keySource: "env" | "db" | null;
    chatgptEnabled: boolean;
  } | null;
  envKeyConfigured: boolean;
  dbKeyConfigured: boolean;
  onProviderChange: (value: AiProvider) => void;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onChatgptEnabledChange: (value: boolean) => void;
  onSave: () => void | Promise<void>;
  onClearDbKey: () => void | Promise<void>;
};

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: "disabled", label: "Disabled" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Custom (OpenAI-compatible)" },
  { value: "chatgpt", label: "ChatGPT (per-user subscription)" },
];

const inputClass = "ui-input w-full";
const labelClass =
  "block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2";

export const AiSettingsCard: React.FC<AiSettingsCardProps> = ({
  loading,
  saving,
  provider,
  baseUrl,
  model,
  apiKey,
  chatgptEnabled,
  status,
  envKeyConfigured,
  dbKeyConfigured,
  onProviderChange,
  onBaseUrlChange,
  onModelChange,
  onApiKeyChange,
  onChatgptEnabledChange,
  onSave,
  onClearDbKey,
}) => (
  <section className="mb-8">
    <SettingsSectionHeader
      icon={<Sparkles size={20} />}
      tileClassName="border-black bg-indigo-400 text-black dark:border-neutral-700 dark:bg-indigo-400 dark:text-black"
      title="AI assistant"
      subtitle="Choose the canvas agent provider. Secrets stay on the server."
    >
      {loading ? (
        <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">Loading…</span>
      ) : status ? (
        <span className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${status.available ? "border-emerald-700 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "border-slate-300 bg-slate-100 text-slate-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"}`}>
          {status.available ? "Ready" : "Setup needed"}
        </span>
      ) : null}
    </SettingsSectionHeader>
    <SettingsCard>
    <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-3">
      <div>
        <label className={labelClass}>Provider</label>
        <PlayfulSelect
          ariaLabel="AI provider"
          value={provider}
          onChange={(value) => onProviderChange(value as AiProvider)}
          options={PROVIDERS}
          className="w-full min-w-0"
          buttonClassName="w-full"
        />
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

    {provider === "chatgpt" && (
      <div className="flex flex-wrap items-center gap-3 border-t-2 border-slate-100 px-4 py-4 dark:border-neutral-800 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">ChatGPT subscriptions</p>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-neutral-400">Allow users to connect their own ChatGPT Plus or Pro account.</p>
        </div>
          <PlayfulSwitch
            checked={chatgptEnabled}
            onChange={onChatgptEnabledChange}
            ariaLabel="Allow ChatGPT subscriptions"
          />
      </div>
    )}

    {provider !== "chatgpt" && (
    <div className="border-t-2 border-slate-100 px-4 py-4 dark:border-neutral-800 sm:px-5">
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
              className="ui-button-secondary flex-shrink-0 px-4"
            >
              Clear key
            </button>
          )}
        </div>
      )}
    </div>
    )}

    <div className="flex items-center justify-between gap-3 border-t-2 border-slate-100 px-4 py-4 dark:border-neutral-800 sm:px-5">
      <p className="text-xs font-medium text-slate-500 dark:text-neutral-400">
        {status?.available ? `${status.provider} · ${status.model ?? "default model"}` : "Complete the provider setup to enable the canvas agent."}
      </p>
      <button
        onClick={() => void onSave()}
        disabled={saving}
        className="ui-button-primary shrink-0 px-5"
      >
        {saving ? "Saving…" : "Save AI settings"}
      </button>
    </div>
    </SettingsCard>
  </section>
);
