import React from 'react';
import { Timer } from 'lucide-react';
import { PlayfulSwitch } from '../../components/PlayfulSwitch';
import {
  SettingsCard,
  SettingsRow,
  SettingsSectionHeader,
  settingsButtonClass,
  settingsSelectClass,
} from '../settings/SettingsRow';

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
  if (saving || autoSaveQueued) return 'Saving…';
  return dirty ? 'Unsaved' : 'Saved';
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
  <section className="mb-6">
    <SettingsSectionHeader
      icon={<Timer size={20} />}
      tileClassName="border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
      title="Login rate limiting"
      subtitle="Throttle repeated login attempts"
    >
      <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">
        {loading ? 'Loading…' : getSaveStatusLabel(saving, autoSaveQueued, dirty)}
      </span>
    </SettingsSectionHeader>

    <SettingsCard>
      <SettingsRow
        title="Rate limiting"
        description={enabled ? 'Brute-force protection active' : 'Only disable in trusted environments'}
      >
        <PlayfulSwitch
          checked={enabled}
          onChange={onToggleEnabled}
          ariaLabel="Toggle login rate limiting"
        />
      </SettingsRow>

      <SettingsRow
        title="Attempts"
        description="Max failed logins per window"
      >
        <input
          type="number"
          min={1}
          aria-label="Max attempts"
          value={maxAttempts}
          onChange={(event) => onMaxAttemptsChange(Number(event.target.value))}
          className={`${settingsSelectClass} w-20`}
        />
        <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">per</span>
        <input
          type="number"
          min={1}
          aria-label="Window in minutes"
          value={windowMinutes}
          onChange={(event) => onWindowMinutesChange(Number(event.target.value))}
          className={`${settingsSelectClass} w-20`}
        />
        <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">min</span>
      </SettingsRow>

      <SettingsRow
        title="Reset lockout"
        description="Clear the lockout for one account"
      >
        <input
          list="admin-user-identifiers"
          aria-label="Account to unlock"
          value={resetIdentifier}
          onChange={(event) => onResetIdentifierChange(event.target.value)}
          placeholder="user@example.com"
          className={`${settingsSelectClass} w-48`}
        />
        <datalist id="admin-user-identifiers">
          {userEmails.map((email) => (
            <option key={email} value={email} />
          ))}
        </datalist>
        <button
          onClick={() => void onReset()}
          disabled={resetLoading}
          className={settingsButtonClass}
        >
          {resetLoading ? 'Resetting…' : 'Reset'}
        </button>
      </SettingsRow>
    </SettingsCard>
  </section>
);
