import { Archive, Moon, Sun, Zap, ZapOff } from "lucide-react";
import type * as api from "../../api";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";
import { UpdateSettingsCard } from "./UpdateSettingsCard";
import { DefaultEngineCard } from "./DefaultEngineCard";
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
      tileClassName="border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
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
      tileClassName="border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
      title="Optimized images"
      description={imageCompression ? "Smaller uploads" : "Original quality"}
    >
      <PlayfulSwitch
        checked={imageCompression}
        onChange={() => toggleImageCompression()}
        ariaLabel="Toggle image optimization"
      />
    </SettingsRow>

    <DefaultEngineCard />

    <SettingsRow
      icon={<Archive size={20} />}
      tileClassName="border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300"
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
