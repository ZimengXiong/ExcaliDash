import React, { useEffect, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import type { AiStatus } from "../../api/ai";
import type { AiProviderDraft } from "./useAiSettings";
import { ProviderEditor } from "./AiProviderEditor";
import { SettingsCard, SettingsSectionHeader } from "../settings/SettingsRow";

export const AiSettingsCard: React.FC<{
  loading: boolean;
  saving: boolean;
  providers: AiProviderDraft[];
  defaultProviderId: string;
  status: AiStatus | null;
  onDefaultProviderChange: (id: string) => void;
  onAddProvider: () => void;
  onUpdateProvider: (id: string, patch: Partial<AiProviderDraft>) => void;
  onRemoveProvider: (id: string) => void;
  onSave: () => void | Promise<void>;
}> = ({
  loading,
  saving,
  providers,
  defaultProviderId,
  status,
  onDefaultProviderChange,
  onAddProvider,
  onUpdateProvider,
  onRemoveProvider,
  onSave,
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
      </SettingsSectionHeader>

      <SettingsCard>
        {providers.map((profile) => (
          <ProviderEditor
            key={profile.id}
            profile={profile}
            saving={saving}
            isDefault={profile.id === defaultProviderId}
            expanded={Boolean(expanded[profile.id])}
            onToggleExpanded={() => toggleExpanded(profile.id)}
            onSetDefault={() => onDefaultProviderChange(profile.id)}
            onChange={(patch) => onUpdateProvider(profile.id, patch)}
            onRemove={() => onRemoveProvider(profile.id)}
          />
        ))}
        {providers.length === 0 && !loading ? (
          <div className="px-4 py-6 text-center text-sm font-medium text-slate-500 dark:text-neutral-400 sm:px-5">
            No providers yet — add one below.
          </div>
        ) : null}
      </SettingsCard>

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
    </section>
  );
};
