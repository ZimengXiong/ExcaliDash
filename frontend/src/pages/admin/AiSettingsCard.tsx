import React, { useEffect, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import type { AiProviderDefinition, AiStatus } from "../../api/ai";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";
import type { AiProviderDraft } from "./useAiSettings";
import { ProviderEditor } from "./AiProviderEditor";
import { SettingsCard, SettingsSectionHeader } from "../settings/SettingsRow";

export const AiSettingsCard: React.FC<{
  readOnly?: boolean;
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
  readOnly = false,
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
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pendingExpand = useRef(false);
  const prevCount = useRef(providers.length);

  useEffect(() => {
    if (pendingExpand.current && providers.length > prevCount.current) {
      const newest = providers[providers.length - 1];
      if (newest) {
        setExpanded((current) => ({ ...current, [newest.id]: true }));
      }
      pendingExpand.current = false;
    }
    prevCount.current = providers.length;
  }, [providers]);

  const toggleExpanded = (id: string) =>
    setExpanded((current) => ({ ...current, [id]: !current[id] }));

  const handleAdd = () => {
    pendingExpand.current = true;
    onAddProvider();
  };

  return (
    <section className="mb-6">
      <SettingsSectionHeader
        icon={<Sparkles size={20} />}
        tileClassName="border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300"
        title="AI provider registry"
        subtitle="Providers and models available to the canvas agent. Click a row to edit it."
      >
        {loading ? (
          <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">
            Loading…
          </span>
        ) : null}
        <span className="rounded-full border-2 border-black bg-white px-2.5 py-0.5 text-xs font-black dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
          {providers.length}
        </span>
        {readOnly ? (
          <span className="rounded-full border-2 border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            Admin managed
          </span>
        ) : null}
      </SettingsSectionHeader>

      <SettingsCard>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">
              Enable AI features
            </h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-neutral-400">
              Hide AI controls and block AI APIs without deleting saved
              providers.
            </p>
          </div>
          <PlayfulSwitch
            checked={enabled}
            onChange={onEnabledChange}
            disabled={readOnly || loading || saving}
            ariaLabel="Enable AI features"
          />
        </div>

        {enabled ? (
          <>
            {providers.map((profile) => (
              <ProviderEditor
                key={profile.id}
                profile={profile}
                providerDefinitions={providerDefinitions}
                readOnly={readOnly}
                saving={saving}
                isDefault={profile.id === defaultProviderId}
                expanded={Boolean(expanded[profile.id])}
                onToggleExpanded={() => toggleExpanded(profile.id)}
                onSetDefault={() => onDefaultProviderChange(profile.id)}
                onChange={(patch) => onUpdateProvider(profile.id, patch)}
                onRemove={() => onRemoveProvider(profile.id)}
                onDiscover={(refresh) =>
                  onDiscoverModels(profile.id, refresh)
                }
                onTest={() => onTestProvider(profile.id)}
              />
            ))}
            {providers.length === 0 && !loading ? (
              <div className="px-4 py-6 text-center text-sm font-medium text-slate-500 dark:text-neutral-400 sm:px-5">
                No providers yet — add one below.
              </div>
            ) : null}
          </>
        ) : (
          <div className="px-4 py-6 text-center text-sm font-medium text-slate-500 dark:text-neutral-400 sm:px-5">
            AI features are disabled. Turn them on to manage the saved provider
            registry.
          </div>
        )}
      </SettingsCard>

      {enabled && !readOnly ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-white px-4 py-2 text-sm font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-0.5 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
          >
            <Plus size={16} /> Add provider
          </button>
          <div className="flex items-center gap-3">
            {status ? (
              <span className="text-sm font-medium text-slate-500 dark:text-neutral-400">
                {status.providers.filter((profile) => profile.available).length}{" "}
                available
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="rounded-xl border-2 border-black bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-0.5 disabled:opacity-60 dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
            >
              {saving ? "Saving…" : "Save provider registry"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};
