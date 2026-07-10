import { Archive, Moon, Sun, Zap, ZapOff } from "lucide-react";
import type * as api from "../../api";
import { UpdateSettingsCard } from "./UpdateSettingsCard";
import { DefaultEngineCard } from "./DefaultEngineCard";

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
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
    <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
      {" "}
      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
        {" "}
        <Archive
          size={32}
          className="text-indigo-600 dark:text-indigo-400 hidden sm:block"
        />{" "}
        <Archive
          size={24}
          className="text-indigo-600 dark:text-indigo-400 sm:hidden"
        />{" "}
      </div>{" "}
      <div className="text-center">
        {" "}
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          Export Backup
        </h3>{" "}
        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
          Exports an `.excalidash` archive organized by collections
        </p>{" "}
      </div>{" "}
      <div className="w-full flex flex-col items-stretch gap-2 pt-2">
        {" "}
        <button
          onClick={exportBackup}
          className="w-full px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all"
        >
          {" "}
          Export{" "}
        </button>{" "}
        <select
          value={backupExportExt}
          onChange={(e) => setBackupExportExt(e.target.value as any)}
          className="w-full px-3 py-2 text-sm font-bold rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-white"
          title="Download name"
        >
          {" "}
          <option value="excalidash">.excalidash</option>{" "}
          <option value="excalidash.zip">.excalidash.zip</option>{" "}
        </select>{" "}
      </div>{" "}
    </div>{" "}
    <button
      onClick={toggleTheme}
      className="w-full flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
    >
      {" "}
      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-amber-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-amber-100 dark:border-neutral-700 group-hover:border-amber-200 dark:group-hover:border-neutral-600 transition-colors">
        {" "}
        {theme === "light" ? (
          <Moon
            size={32}
            className="text-amber-600 dark:text-amber-400 hidden sm:block"
          />
        ) : (
          <Sun
            size={32}
            className="text-amber-600 dark:text-amber-400 hidden sm:block"
          />
        )}
        {theme === "light" ? (
          <Moon
            size={24}
            className="text-amber-600 dark:text-amber-400 sm:hidden"
          />
        ) : (
          <Sun
            size={24}
            className="text-amber-600 dark:text-amber-400 sm:hidden"
          />
        )}{" "}
      </div>{" "}
      <div className="text-center">
        {" "}
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          {" "}
          {theme === "light" ? "Dark Mode" : "Light Mode"}{" "}
        </h3>{" "}
        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
          {" "}
          Switch to {theme === "light" ? "dark" : "light"} theme{" "}
        </p>{" "}
      </div>{" "}
    </button>{" "}
    <button
      onClick={toggleImageCompression}
      className="w-full flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
    >
      {" "}
      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-blue-100 dark:border-neutral-700 group-hover:border-blue-200 dark:group-hover:border-neutral-600 transition-colors">
        {" "}
        {imageCompression ? (
          <Zap
            size={32}
            className="text-blue-600 dark:text-blue-400 hidden sm:block"
          />
        ) : (
          <ZapOff
            size={32}
            className="text-blue-600 dark:text-blue-400 hidden sm:block"
          />
        )}{" "}
        {imageCompression ? (
          <Zap
            size={24}
            className="text-blue-600 dark:text-blue-400 sm:hidden"
          />
        ) : (
          <ZapOff
            size={24}
            className="text-blue-600 dark:text-blue-400 sm:hidden"
          />
        )}{" "}
      </div>{" "}
      <div className="text-center">
        {" "}
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          {" "}
          {imageCompression ? "Optimized Images" : "Raw Images"}{" "}
        </h3>{" "}
        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
          {" "}
          {imageCompression
            ? "Lossy compression enabled"
            : "Lossless (high bandwidth) enabled"}{" "}
        </p>{" "}
      </div>{" "}
    </button>{" "}
    <UpdateSettingsCard
      updateChannel={updateChannel}
      updateInfo={updateInfo}
      updateLoading={updateLoading}
      updateError={updateError}
      onChannelChange={onUpdateChannelChange}
      onCheckForUpdates={onCheckForUpdates}
    />{" "}
    <DefaultEngineCard />{" "}
  </div>
);
