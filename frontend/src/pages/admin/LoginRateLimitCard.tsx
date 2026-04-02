import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

type LoginRateLimitCardProps = {
  loading: boolean;
  saving: boolean;
  autoSaveQueued: boolean;
  dirty: boolean;
  enabled: boolean;
  windowMinutes: number;
  maxAttempts: number;
  resetIdentifier: string;
  resetLoading: boolean;
  userEmails: string[];
  onToggleEnabled: () => void;
  onWindowMinutesChange: (value: number) => void;
  onMaxAttemptsChange: (value: number) => void;
  onResetIdentifierChange: (value: string) => void;
  onReset: () => void | Promise<void>;
};

const getSaveStatusLabel = (saving: boolean, autoSaveQueued: boolean, dirty: boolean) => {
  if (saving || autoSaveQueued) return 'Saving changes…';
  return dirty ? 'Unsaved changes' : 'All changes saved';
};

export const LoginRateLimitCard: React.FC<LoginRateLimitCardProps> = ({
  loading,
  saving,
  autoSaveQueued,
  dirty,
  enabled,
  windowMinutes,
  maxAttempts,
  resetIdentifier,
  resetLoading,
  userEmails,
  onToggleEnabled,
  onWindowMinutesChange,
  onMaxAttemptsChange,
  onResetIdentifierChange,
  onReset,
}) => (
  <div className="mb-6 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-4 sm:p-6">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-12 h-12 bg-slate-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-slate-200 dark:border-neutral-700">
        <SettingsIcon size={24} className="text-slate-700 dark:text-neutral-200" />
      </div>
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Login Rate Limiting</h2>
        <p className="text-sm text-slate-600 dark:text-neutral-400 font-medium">
          Reduce brute-force attacks; disable only for trusted environments. Changes are saved
          automatically.
        </p>
      </div>
      {loading && (
        <span className="ml-auto text-sm text-slate-500 dark:text-neutral-500 font-medium">
          Loading…
        </span>
      )}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Rate Limiting
        </label>
        <button
          type="button"
          onClick={onToggleEnabled}
          className={`w-full px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm ${
            enabled
              ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
          }`}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Window (minutes)
        </label>
        <input
          type="number"
          min={1}
          value={windowMinutes}
          onChange={(event) => onWindowMinutesChange(Number(event.target.value))}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Max attempts
        </label>
        <input
          type="number"
          min={1}
          value={maxAttempts}
          onChange={(event) => onMaxAttemptsChange(Number(event.target.value))}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
        />
      </div>
    </div>

    <div className="mt-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
          Reset lockout (email/username)
        </label>
        <input
          list="admin-user-identifiers"
          value={resetIdentifier}
          onChange={(event) => onResetIdentifierChange(event.target.value)}
          placeholder="user@example.com"
          className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
        />
        <datalist id="admin-user-identifiers">
          {userEmails.map((email) => (
            <option key={email} value={email} />
          ))}
        </datalist>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-neutral-400">
          {getSaveStatusLabel(saving, autoSaveQueued, dirty)}
        </p>
        <button
          onClick={() => void onReset()}
          disabled={resetLoading}
          className="px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
        >
          {resetLoading ? 'Resetting…' : 'Reset'}
        </button>
      </div>
    </div>
  </div>
);
