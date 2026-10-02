import {
  Archive,
  Eye,
  EyeOff,
  Languages,
  Moon,
  Sun,
  Zap,
  ZapOff,
} from "lucide-react";
import type * as api from "../../api";
import { PlayfulSwitch } from "../../components/PlayfulSwitch";
import { UpdateSettingsCard } from "./UpdateSettingsCard";
import {
  SettingsCard,
  SettingsRow,
  settingsPrimaryButtonClass,
} from "./SettingsRow";
import { useLocale } from "../../context/useLocale";
import {
  MIN_IMAGE_COMPRESSION_THRESHOLD_MB,
  MAX_IMAGE_COMPRESSION_THRESHOLD_MB,
  normalizeImageCompressionThreshold,
} from "../../utils/imageCompressionSettings";

type SettingsMainGridProps = {
  exportBackup: () => void;
  theme: string;
  toggleTheme: () => void;
  imageCompression: boolean;
  toggleImageCompression: () => void;
  imageCompressionThresholdMb: number;
  onImageCompressionThresholdChange: (value: number) => void;
  editorAutoHide: boolean;
  onEditorAutoHideChange: (enabled: boolean) => void;
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
  imageCompressionThresholdMb,
  onImageCompressionThresholdChange,
  editorAutoHide,
  onEditorAutoHideChange,
  updateChannel,
  updateInfo,
  updateLoading,
  updateError,
  onUpdateChannelChange,
  onCheckForUpdates,
}: SettingsMainGridProps) => {
  const { language, setLanguage, t } = useLocale();

  return (
    <SettingsCard>
      <SettingsRow
        icon={<Languages size={20} />}
        tileClassName="border-black bg-emerald-400 text-black dark:border-neutral-700 dark:bg-emerald-400 dark:text-black"
        title={t("settings.language")}
      >
        <select
          aria-label={t("settings.language")}
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className="ui-input text-sm font-bold"
        >
          <option value="en">English</option>
          <option value="zh-CN">简体中文</option>
          {language !== "en" && language !== "zh-CN" && (
            <option value={language}>{language} (editor language)</option>
          )}
        </select>
      </SettingsRow>

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
        icon={editorAutoHide ? <EyeOff size={20} /> : <Eye size={20} />}
        tileClassName="border-black bg-cyan-400 text-black dark:border-neutral-700 dark:bg-cyan-400 dark:text-black"
        title="Auto-hide editor header"
        description={
          editorAutoHide ? "Hide by default" : "Keep visible by default"
        }
      >
        <PlayfulSwitch
          checked={editorAutoHide}
          onChange={onEditorAutoHideChange}
          ariaLabel="Toggle editor header auto-hide default"
        />
      </SettingsRow>

      <SettingsRow
        icon={imageCompression ? <Zap size={20} /> : <ZapOff size={20} />}
        tileClassName="border-black bg-blue-400 text-black dark:border-neutral-700 dark:bg-blue-400 dark:text-black"
        title="Optimized images"
        description={
          imageCompression
            ? `Compress images over ${imageCompressionThresholdMb} MB`
            : "Original quality"
        }
      >
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-neutral-300">
            <input
              aria-label="Image compression threshold in MB"
              type="number"
              min={MIN_IMAGE_COMPRESSION_THRESHOLD_MB}
              max={MAX_IMAGE_COMPRESSION_THRESHOLD_MB}
              step="0.05"
              key={imageCompressionThresholdMb}
              defaultValue={imageCompressionThresholdMb}
              disabled={!imageCompression}
              onBlur={(event) => {
                const input = event.currentTarget;
                const value = Number.isFinite(input.valueAsNumber)
                  ? normalizeImageCompressionThreshold(input.valueAsNumber)
                  : imageCompressionThresholdMb;
                input.value = String(value);
                if (value !== imageCompressionThresholdMb) {
                  onImageCompressionThresholdChange(value);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="ui-input w-24 text-sm tabular-nums disabled:opacity-50"
            />
            <span>MB</span>
          </label>
          <PlayfulSwitch
            checked={imageCompression}
            onChange={() => toggleImageCompression()}
            ariaLabel="Toggle image optimization"
          />
        </div>
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
};
