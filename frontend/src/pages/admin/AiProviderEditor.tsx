import React from "react";
import {
  ChevronDown,
  KeyRound,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import type { AiProviderDefinition } from "../../api/ai";
import { PlayfulSelect } from "../../components/PlayfulSelect";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";
import type { AiProviderDraft, ConfigurableAiProvider } from "./useAiSettings";

const inputClass =
  "w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white";
const labelClass =
  "mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400";

const PROVIDERS: Array<{ value: ConfigurableAiProvider; label: string }> = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Google Gemini" },
  { value: "opencode_go", label: "OpenCode Go" },
  { value: "custom", label: "OpenAI-compatible" },
  { value: "chatgpt", label: "ChatGPT subscription" },
];


const splitCsv = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const KeyStatusChip: React.FC<{ profile: AiProviderDraft }> = ({ profile }) => {
  if (profile.provider === "chatgpt") {
    return (
      <span className="hidden rounded-full border-2 border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 sm:inline-block">
        Per-user OAuth
      </span>
    );
  }
  if (profile.keySource === "env") {
    return (
      <span className="hidden rounded-full border-2 border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300 sm:inline-block">
        Env key
      </span>
    );
  }
  return profile.keyConfigured ? (
    <span className="hidden rounded-full border-2 border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 sm:inline-block">
      Key stored
    </span>
  ) : (
    <span className="hidden rounded-full border-2 border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 sm:inline-block">
      No key
    </span>
  );
};

export const ProviderEditor: React.FC<{
  profile: AiProviderDraft;
  readOnly?: boolean;
  saving: boolean;
  providerDefinitions: AiProviderDefinition[];
  isDefault: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSetDefault: () => void;
  onChange: (patch: Partial<AiProviderDraft>) => void;
  onRemove: () => void;
}> = ({
  profile,
  readOnly = false,
  saving,
  providerDefinitions,
  isDefault,
  expanded,
  onToggleExpanded,
  onSetDefault,
  onChange,
  onRemove,
}) => {
  const models = splitCsv(profile.modelsText);
  const isChatGpt = profile.provider === "chatgpt";
  const isCustom = profile.provider === "custom";
  const isManagedProvider = !isChatGpt && !isCustom;
  const providerOptions: Array<{
    value: ConfigurableAiProvider;
    label: string;
  }> =
    providerDefinitions.length > 0
      ? providerDefinitions.map((definition) => ({
          value: definition.id,
          label: definition.label,
        }))
      : PROVIDERS;

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-3.5 sm:gap-3 sm:px-5">
        <button
          type="button"
          onClick={readOnly ? undefined : onToggleExpanded}
          aria-expanded={expanded}
          disabled={readOnly}
          className="flex min-w-0 flex-1 items-center text-left disabled:cursor-default"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-bold text-slate-900 dark:text-white">
                {profile.label || "Untitled provider"}
              </span>
              {isDefault ? (
                <span className="shrink-0 rounded-full border-2 border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  DEFAULT
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-xs font-medium text-slate-500 dark:text-neutral-400">
              {PROVIDERS.find((p) => p.value === profile.provider)?.label}
              {isChatGpt
                ? " · models managed automatically"
                : isManagedProvider
                  ? " · model catalog managed automatically"
                  : models.length > 0
                  ? ` · ${models.length} model${models.length === 1 ? "" : "s"}`
                  : " · no models yet"}
            </span>
          </span>
        </button>

        {isCustom && models.length > 0 ? (
          <div className="hidden min-w-0 flex-wrap items-center gap-1 lg:flex">
            {models.slice(0, 2).map((model) => (
              <span
                key={model}
                className="max-w-[140px] truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {model}
              </span>
            ))}
            {models.length > 2 ? (
              <span className="text-[11px] font-bold text-slate-400">
                +{models.length - 2}
              </span>
            ) : null}
          </div>
        ) : null}

        <KeyStatusChip profile={profile} />

        {readOnly ? null : (
          <>
            <button
              type="button"
              onClick={onSetDefault}
              aria-pressed={isDefault}
              aria-label={
                isDefault
                  ? "Default provider"
                  : `Set ${profile.label} as default`
              }
              title={isDefault ? "Default provider" : "Set as default"}
              className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              <Star
                size={18}
                className={
                  isDefault
                    ? "fill-amber-300 text-amber-500"
                    : "text-slate-300 dark:text-neutral-600"
                }
              />
            </button>
            <PlayfulSwitch
              checked={profile.enabled}
              disabled={saving}
              onChange={(enabled) => onChange({ enabled })}
              ariaLabel={
                profile.enabled ? "Disable provider" : "Enable provider"
              }
            />
            <button
              type="button"
              onClick={onRemove}
              disabled={saving}
              aria-label={`Remove ${profile.label}`}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
            >
              <Trash2 size={17} />
            </button>
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse details" : "Edit details"}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-neutral-800"
            >
              <ChevronDown
                size={18}
                className={`transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </>
        )}
      </div>

      {expanded ? (
        <div className="border-t-2 border-dashed border-slate-200 px-4 pb-4 pt-4 dark:border-neutral-700 sm:px-5">
          <div className="mb-4 max-w-xs">
            <span className={labelClass}>Provider</span>
            <PlayfulSelect
              ariaLabel="Provider type"
              value={profile.provider}
              onChange={(value) =>
                onChange({ provider: value as ConfigurableAiProvider })
              }
              options={providerOptions}
              align="left"
              disabled={saving}
              className="w-full"
            />
          </div>
          {isChatGpt ? (
            <div className="flex max-w-3xl items-start gap-2 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-medium text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                <Sparkles size={16} className="mt-0.5 shrink-0" />
                <span>
                  Models, reasoning levels, OAuth endpoints, and the Codex base
                  URL are managed automatically. Each user connects their own
                  ChatGPT subscription from the canvas chat panel.
                </span>
              </div>
          ) : (
            <div className="max-w-3xl">
              {isCustom ? (
                <div className="mb-4 grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
                  <div>
                    <label className={labelClass}>Display name</label>
                    <input
                      value={profile.label}
                      onChange={(event) =>
                        onChange({ label: event.target.value })
                      }
                      aria-label="Provider label"
                      className={`${inputClass} font-semibold`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Base URL</label>
                    <input
                      value={profile.baseUrl}
                      onChange={(event) =>
                        onChange({ baseUrl: event.target.value })
                      }
                      placeholder="https://your-provider.example/v1"
                      className={inputClass}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>
                      Model names (comma-separated)
                    </label>
                    <input
                      value={profile.modelsText}
                      onChange={(event) =>
                        onChange({ modelsText: event.target.value })
                      }
                      placeholder="model-name"
                      className={inputClass}
                    />
                  </div>
                </div>
              ) : null}

              <label className={labelClass}>
                <span className="inline-flex items-center gap-1.5">
                  <KeyRound size={12} /> API key
                </span>
              </label>
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
                      onChange({
                        apiKey: event.target.value,
                        clearApiKey: false,
                      })
                    }
                    placeholder={
                      profile.keyConfigured
                        ? "Stored — leave blank to keep"
                        : "Paste API key"
                    }
                    aria-label={`${profile.label} API key`}
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
                      className="shrink-0 rounded-xl border-2 border-slate-200 px-3 text-sm font-bold transition-colors hover:border-red-300 hover:text-red-600 dark:border-neutral-700"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              )}

              {isManagedProvider ? (
                <details className="mt-4 rounded-xl border-2 border-slate-200 bg-slate-50/70 dark:border-neutral-700 dark:bg-neutral-800/40">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-slate-700 dark:text-neutral-200">
                    Advanced
                  </summary>
                  <div className="border-t border-slate-200 px-3 py-3 dark:border-neutral-700">
                    <label className={labelClass}>
                      Custom model names (optional)
                    </label>
                    <input
                      value={profile.customModelsText}
                      aria-label="Custom model names"
                      onChange={(event) =>
                        onChange({ customModelsText: event.target.value })
                      }
                      placeholder="custom-model-id, another-model-id"
                      className={inputClass}
                    />
                    <p className="mt-2 text-xs font-medium text-slate-500 dark:text-neutral-400">
                      ExcaliDash loads the provider&apos;s available models and
                      endpoint automatically. Add IDs here only when a new model
                      is missing from the provider catalog.
                    </p>
                  </div>
                </details>
              ) : null}

              {profile.testResult && !profile.testResult.ok ? (
                <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                  Last validation warning: {profile.testResult.message}
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
