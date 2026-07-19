import type { ReactNode } from "react";
import { Check, FlaskConical, RefreshCw, ShieldCheck } from "lucide-react";
import type * as api from "../../api";
import { PlayfulSelect } from "../../components/PlayfulSelect";
import { SettingsRow, settingsButtonClass } from "./SettingsRow";

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
  let status: ReactNode = "Status unknown";
  if (updateInfo?.outboundEnabled === false) {
    status = "Update checks disabled";
  } else if (updateLoading) {
    status = "Checking…";
  } else if (updateInfo?.isUpdateAvailable) {
    status = (
      <span className="font-bold text-emerald-600 dark:text-emerald-400">
        v{updateInfo.latestVersion} available
      </span>
    );
  } else if (updateInfo?.latestVersion) {
    status = (
      <span className="inline-flex items-center gap-1">
        <Check size={12} strokeWidth={3} className="text-emerald-500" />
        Up to date
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
      title="Updates"
      description={
        <>
          {status}
          <a
            href="https://github.com/ZimengXiong/ExcaliDash/releases"
            target="_blank"
            rel="noreferrer"
            className="ml-2 font-bold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Releases
          </a>
          {updateInfo?.error && !updateLoading ? (
            <span className="block text-red-500 dark:text-red-400">
              Error: {updateInfo.error}
            </span>
          ) : null}
        </>
      }
    >
      <PlayfulSelect
        ariaLabel="Update channel"
        value={updateChannel}
        onChange={(value) =>
          onChannelChange(value === "prerelease" ? "prerelease" : "stable")
        }
        options={[
          { value: "stable", label: "Stable", icon: <ShieldCheck size={14} /> },
          {
            value: "prerelease",
            label: "Prerelease",
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
        Check
      </button>
    </SettingsRow>
  );
};
