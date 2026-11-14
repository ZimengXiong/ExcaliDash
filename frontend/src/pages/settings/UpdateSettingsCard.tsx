import type { ReactNode } from "react";
import { Check, FlaskConical, RefreshCw, ShieldCheck } from "lucide-react";
import type * as api from "../../api";
import { PlayfulSelect } from "../../components/PlayfulSelect";
import { SettingsRow, settingsButtonClass } from "./SettingsRow";
import { useLocale } from "../../context/useLocale";

type UpdateSettingsCardProps = {
  updateChannel: api.UpdateChannel;
  updateInfo: api.UpdateInfo | null;
  updateLoading: boolean;
  updateError: string | null;
  onChannelChange: (channel: api.UpdateChannel) => void;
  onCheckForUpdates: () => void;
};

export const UpdateSettingsCard = ({
  updateChannel,
  updateInfo,
  updateLoading,
  updateError,
  onChannelChange,
  onCheckForUpdates,
}: UpdateSettingsCardProps) => {
  const { t } = useLocale();
  let status: ReactNode = t("settings.update.statusUnknown");
  if (updateInfo?.outboundEnabled === false) {
    status = t("settings.update.checksDisabled");
  } else if (updateLoading) {
    status = t("settings.update.checking");
  } else if (updateInfo?.isUpdateAvailable) {
    status = (
      <span className="font-bold text-emerald-600 dark:text-emerald-400">
        {t("settings.update.versionAvailable", {
          version: updateInfo.latestVersion ?? "",
        })}
      </span>
    );
  } else if (updateInfo?.latestVersion) {
    status = (
      <span className="inline-flex items-center gap-1">
        <Check size={12} strokeWidth={3} className="text-emerald-500" />
        {t("settings.update.upToDate")}
      </span>
    );
  } else if (updateError) {
    status = (
      <span className="text-red-600 dark:text-red-400">{updateError}</span>
    );
  }

  return (
    <SettingsRow
      icon={
        <RefreshCw size={20} className={updateLoading ? "animate-spin" : ""} />
      }
      tileClassName="border-black bg-emerald-400 text-black dark:border-neutral-700 dark:bg-emerald-400 dark:text-black"
      title={t("settings.update.title")}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {status}
          <a
            href="https://github.com/ZimengXiong/ExcaliDash/releases"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center font-bold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {t("settings.update.releases")}
          </a>
          {updateInfo?.error && !updateLoading ? (
            <span className="basis-full text-red-500 dark:text-red-400">
              {t("settings.update.error", { error: updateInfo.error })}
            </span>
          ) : null}
        </span>
      }
    >
      <PlayfulSelect
        ariaLabel={t("update.channel")}
        value={updateChannel}
        onChange={(value) =>
          onChannelChange(value === "prerelease" ? "prerelease" : "stable")
        }
        options={[
          {
            value: "stable",
            label: t("settings.update.stable"),
            icon: <ShieldCheck size={14} />,
          },
          {
            value: "prerelease",
            label: t("settings.update.prerelease"),
            icon: <FlaskConical size={14} />,
          },
        ]}
      />
      <button
        type="button"
        onClick={onCheckForUpdates}
        disabled={updateLoading}
        className={settingsButtonClass}
      >
        {t("settings.update.check")}
      </button>
    </SettingsRow>
  );
};
