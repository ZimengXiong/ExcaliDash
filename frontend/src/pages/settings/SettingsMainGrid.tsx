import { Archive, Moon, Sun, Zap, ZapOff } from "lucide-react";
import type * as api from "../../api";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";
import { UpdateSettingsCard } from "./UpdateSettingsCard";
import {
  SettingsCard,
  SettingsRow,
  settingsPrimaryButtonClass,
} from "./SettingsRow";

type SettingsMainGridProps = {
  exportBackup: () => void;
  theme: string;
  toggleTheme: () => void;
  imageCompression: boolean;
  toggleImageCompression: () => void;
  updateChannel: api.UpdateChannel;
  updateInfo: api.UpdateInfo | null;
  updateLoading: boolean;
  updateError: string | null;
  onUpdateChannelChange: (channel: api.UpdateChannel) => void;
  onCheckForUpdates: () => void;
};

export const SettingsMainGrid = ({
  exportBackup,
  theme,
  toggleTheme,
  imageCompression,
  toggleImageCompression,
  updateChannel,
  updateInfo,
  updateLoading,
  updateError,
  onUpdateChannelChange,
  onCheckForUpdates,
}: SettingsMainGridProps) => (
  <SettingsCard>
    <SettingsRow
      icon={theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
      tileClassName="border-black bg-amber-400 text-black dark:border-neutral-700 dark:bg-amber-400 dark:text-black"
      title="Appearance"
    >
      <PlayfulSwitch
        checked={theme === "dark"}
        onChange={() => toggleTheme()}
        ariaLabel="Toggle dark mode"
      />
    </SettingsRow>

    <SettingsRow
      icon={imageCompression ? <Zap size={20} /> : <ZapOff size={20} />}
      tileClassName="border-black bg-blue-400 text-black dark:border-neutral-700 dark:bg-blue-400 dark:text-black"
      title="Optimized images"
      description={imageCompression ? "Smaller uploads" : "Original quality"}
    >
      <PlayfulSwitch
        checked={imageCompression}
        onChange={() => toggleImageCompression()}
        ariaLabel="Toggle image optimization"
      />
    </SettingsRow>

    <SettingsRow
      icon={<Archive size={20} />}
      tileClassName="border-black bg-indigo-400 text-black dark:border-neutral-700 dark:bg-indigo-400 dark:text-black"
      title="Export backup"
    >
      <button onClick={exportBackup} className={settingsPrimaryButtonClass}>
        Export
      </button>
    </SettingsRow>

    <UpdateSettingsCard
      updateChannel={updateChannel}
      updateInfo={updateInfo}
      updateLoading={updateLoading}
      updateError={updateError}
      onChannelChange={onUpdateChannelChange}
      onCheckForUpdates={onCheckForUpdates}
    />
  </SettingsCard>
);
