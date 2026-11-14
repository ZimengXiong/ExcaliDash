import React from "react";
import { Timer } from "lucide-react";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";
import {
  SettingsCard,
  SettingsRow,
  SettingsSectionHeader,
  settingsButtonClass,
  settingsSelectClass,
} from "../settings/SettingsRow";
import { useLocale } from "../../context/useLocale";
import type { TranslationKey } from "../../i18n";

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

const getSaveStatusKey = (
  saving: boolean,
  autoSaveQueued: boolean,
  dirty: boolean,
): TranslationKey => {
  if (saving || autoSaveQueued) return "common.saving";
  return dirty ? "admin.rateLimit.unsaved" : "admin.rateLimit.saved";
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
}) => {
  const { t } = useLocale();
  return (
    <section className="mb-6">
      <SettingsSectionHeader
        icon={<Timer size={20} />}
        tileClassName="border-black bg-amber-400 text-black dark:border-neutral-700 dark:bg-amber-400 dark:text-black"
        title={t("admin.rateLimit.title")}
        subtitle={t("admin.rateLimit.subtitle")}
      >
        <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">
          {loading
            ? t("admin.access.loading")
            : t(getSaveStatusKey(saving, autoSaveQueued, dirty))}
        </span>
      </SettingsSectionHeader>

      <SettingsCard>
        <SettingsRow
          title={t("admin.rateLimit.rowTitle")}
          description={
            enabled
              ? t("admin.rateLimit.active")
              : t("admin.rateLimit.inactive")
          }
        >
          <PlayfulSwitch
            checked={enabled}
            onChange={onToggleEnabled}
            ariaLabel={t("admin.rateLimit.toggle")}
          />
        </SettingsRow>

        <SettingsRow
          title={t("admin.rateLimit.attempts")}
          description={t("admin.rateLimit.attemptsDescription")}
        >
          <input
            type="number"
            min={1}
            aria-label={t("admin.rateLimit.maxAttempts")}
            value={maxAttempts}
            onChange={(event) =>
              onMaxAttemptsChange(Number(event.target.value))
            }
            className={`${settingsSelectClass} w-20`}
          />
          <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">
            {t("admin.rateLimit.per")}
          </span>
          <input
            type="number"
            min={1}
            aria-label={t("admin.rateLimit.windowMinutes")}
            value={windowMinutes}
            onChange={(event) =>
              onWindowMinutesChange(Number(event.target.value))
            }
            className={`${settingsSelectClass} w-20`}
          />
          <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">
            {t("admin.rateLimit.minutesShort")}
          </span>
        </SettingsRow>

        <SettingsRow
          title={t("admin.rateLimit.resetLockout")}
          description={t("admin.rateLimit.resetLockoutDescription")}
        >
          <input
            list="admin-user-identifiers"
            aria-label={t("admin.rateLimit.accountToUnlock")}
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
            {resetLoading ? t("admin.resetting") : t("admin.reset")}
          </button>
        </SettingsRow>
      </SettingsCard>
    </section>
  );
};
