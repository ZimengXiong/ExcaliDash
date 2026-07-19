import { Archive, File, FileArchive, Moon, Sun, Zap, ZapOff } from "lucide-react";
import type * as api from "../../api";
import { PlayfulSelect } from "../../components/PlayfulSelect";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";
import { UpdateSettingsCard } from "./UpdateSettingsCard";
import { DefaultEngineCard } from "./DefaultEngineCard";
import {
  SettingsCard,
  SettingsRow,
  settingsPrimaryButtonClass,
} from "./SettingsRow";

type SettingsMainGridProps = {
  backupExportExt: "excalidash" | "excalidash.zip";
  setBackupExportExt: (ext: "excalidash" | "excalidash.zip") => void;
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
  backupExportExt,
  setBackupExportExt,
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
      description={theme === "light" ? "Light theme" : "Dark theme"}
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
      description={
        imageCompression
          ? "Lossy compression saves bandwidth"
          : "Lossless originals (high bandwidth)"
      }
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
      description="Download an archive organized by collections"
    >
      <PlayfulSelect
        ariaLabel="Backup format"
        value={backupExportExt}
        onChange={(value) =>
          setBackupExportExt(value as "excalidash" | "excalidash.zip")
        }
        options={[
          { value: "excalidash", label: ".excalidash", icon: <File size={14} /> },
          {
            value: "excalidash.zip",
            label: ".excalidash.zip",
            icon: <FileArchive size={14} />,
          },
        ]}
      />
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
