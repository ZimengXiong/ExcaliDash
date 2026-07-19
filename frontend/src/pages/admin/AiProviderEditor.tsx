import React from "react";
import { ChevronDown, KeyRound, Sparkles, Star, Trash2 } from "lucide-react";
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

const PROVIDER_META: Record<
  ConfigurableAiProvider,
  { label: string; tile: string }
> = {
  anthropic: {
    label: "Anthropic",
    tile: "border-orange-300 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  },
  openai: {
    label: "OpenAI",
    tile: "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  gemini: {
    label: "Gemini",
    tile: "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  },
  opencode_go: {
    label: "OpenCode Go",
    tile: "border-cyan-300 bg-cyan-100 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
  },
  custom: {
    label: "Compatible",
    tile: "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  },
  chatgpt: {
    label: "ChatGPT",
    tile: "border-slate-900 bg-slate-900 text-white dark:border-neutral-400 dark:bg-neutral-100 dark:text-slate-900",
  },
};

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
  saving: boolean;
  isDefault: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSetDefault: () => void;
  onChange: (patch: Partial<AiProviderDraft>) => void;
  onRemove: () => void;
}> = ({
  profile,
  saving,
  isDefault,
  expanded,
  onToggleExpanded,
  onSetDefault,
  onChange,
  onRemove,
}) => {
  const meta = PROVIDER_META[profile.provider];
  const models = splitCsv(profile.modelsText);
  const isChatGpt = profile.provider === "chatgpt";

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-3.5 sm:gap-3 sm:px-5">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 text-sm font-black ${meta.tile}`}
          >
            {meta.label.charAt(0)}
          </span>
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
                : models.length > 0
                  ? ` · ${models.length} model${models.length === 1 ? "" : "s"}`
                  : " · no models yet"}
            </span>
          </span>
        </button>

        {!isChatGpt && models.length > 0 ? (
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

        <button
          type="button"
          onClick={onSetDefault}
          aria-pressed={isDefault}
          aria-label={
            isDefault ? "Default provider" : `Set ${profile.label} as default`
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
          ariaLabel={profile.enabled ? "Disable provider" : "Enable provider"}
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
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded ? (
        <div className="border-t-2 border-dashed border-slate-200 px-4 pb-4 pt-4 dark:border-neutral-700 sm:px-5">
          <div className="grid max-w-3xl grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            <div>
              <label className={labelClass}>Display name</label>
              <input
                value={profile.label}
                onChange={(event) => onChange({ label: event.target.value })}
                aria-label="Provider label"
                className={`${inputClass} font-semibold`}
              />
            </div>
            <div>
              <label className={labelClass}>Provider type</label>
              <PlayfulSelect
                ariaLabel="Provider type"
                value={profile.provider}
                onChange={(value) =>
                  onChange({ provider: value as ConfigurableAiProvider })
                }
                options={PROVIDERS.map((provider) => ({
                  value: provider.value,
                  label: provider.label,
                }))}
                className="w-full"
                buttonClassName="w-full px-3 py-2 font-normal"
              />
            </div>
            {isChatGpt ? (
              <div className="flex items-start gap-2 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-medium text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200 md:col-span-2">
                <Sparkles size={16} className="mt-0.5 shrink-0" />
                <span>
                  Models, reasoning levels, OAuth endpoints, and the Codex base
                  URL are managed automatically. Each user connects their own
                  ChatGPT subscription from the canvas chat panel.
                </span>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelClass}>Models (comma-separated)</label>
                  <input
                    value={profile.modelsText}
                    onChange={(event) =>
                      onChange({ modelsText: event.target.value })
                    }
                    placeholder="gpt-5, gpt-4.1"
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
                    placeholder="minimal, low, medium, high"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Base URL (optional)</label>
                  <input
                    value={profile.baseUrl}
                    onChange={(event) =>
                      onChange({ baseUrl: event.target.value })
                    }
                    placeholder="https://api.openai.com/v1"
                    className={inputClass}
                  />
                </div>
              </>
            )}
          </div>

          {!isChatGpt ? (
            <div className="mt-4 max-w-3xl">
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
                      className="shrink-0 rounded-xl border-2 border-slate-200 px-3 text-sm font-bold transition-colors hover:border-red-300 hover:text-red-600 dark:border-neutral-700"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
