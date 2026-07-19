import type React from "react";
import { ChevronRight, Info, ShieldCheck, Upload } from "lucide-react";
import { importLegacyFiles } from "../../utils/importUtils";
import { SettingsRow, settingsButtonClass } from "./SettingsRow";

type DialogState = { isOpen: boolean; message: string };
type SuccessDialogState = { isOpen: boolean; message: React.ReactNode };

type AdvancedSettingsProps = {
  authEnabled: boolean | null;
  authMode: string | null | undefined;
  authToggleLoading: boolean;
  backupImportLoading: boolean;
  legacyDbImportLoading: boolean;
  isManagedAuthMode: boolean;
  user: { role?: string } | null | undefined;
  appVersion: string;
  buildLabel: string | undefined;
  verifyBackupFile: (file: File) => Promise<void>;
  verifyLegacyDbFile: (file: File) => Promise<void>;
  confirmToggleAuthEnabled: () => void;
  setImportError: React.Dispatch<React.SetStateAction<DialogState>>;
  setImportSuccess: React.Dispatch<React.SetStateAction<SuccessDialogState>>;
};

export const AdvancedSettings = ({
  authEnabled,
  authMode,
  authToggleLoading,
  backupImportLoading,
  legacyDbImportLoading,
  isManagedAuthMode,
  user,
  appVersion,
  buildLabel,
  verifyBackupFile,
  verifyLegacyDbFile,
  confirmToggleAuthEnabled,
  setImportError,
  setImportSuccess,
}: AdvancedSettingsProps) => (
  <details className="group mt-6 overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
    <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3.5 text-sm font-bold text-slate-800 dark:text-neutral-200 sm:px-5 sm:text-base">
      <ChevronRight
        size={16}
        className="transition-transform group-open:rotate-90"
      />
      Advanced / Legacy
    </summary>
    <div className="divide-y divide-slate-100 border-t-2 border-slate-100 dark:divide-neutral-800 dark:border-neutral-800">
      <SettingsRow
        icon={<Upload size={20} />}
        tileClassName="border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
        title="Import backup"
        description="Merge a .excalidash backup into your account"
      >
        <input
          type="file"
          accept=".excalidash,.zip"
          className="hidden"
          id="settings-import-backup"
          onChange={async (e) => {
            const file = (e.target.files || [])[0];
            if (!file) return;
            await verifyBackupFile(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() =>
            document.getElementById("settings-import-backup")?.click()
          }
          disabled={backupImportLoading}
          className={settingsButtonClass}
        >
          {backupImportLoading ? "Verifying…" : "Choose file"}
        </button>
      </SettingsRow>

      <SettingsRow
        icon={<ShieldCheck size={20} />}
        tileClassName="border-slate-200 bg-slate-50 text-slate-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        title={authEnabled ? "Authentication on" : "Authentication off"}
        description={
          isManagedAuthMode
            ? `Managed by AUTH_MODE=${authMode}`
            : authEnabled
              ? user?.role === "ADMIN"
                ? "Multi-user login enabled"
                : "Only admins can disable"
              : "Single-user mode"
        }
      >
        <button
          onClick={confirmToggleAuthEnabled}
          disabled={
            isManagedAuthMode ||
            authEnabled === null ||
            authToggleLoading ||
            (authEnabled === true && user?.role !== "ADMIN")
          }
          className={settingsButtonClass}
        >
          {authToggleLoading
            ? authEnabled
              ? "Disabling…"
              : "Enabling…"
            : authEnabled
              ? "Disable"
              : "Enable"}
        </button>
      </SettingsRow>

      <SettingsRow
        icon={<Upload size={20} />}
        tileClassName="border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        title="Legacy import"
        description=".excalidraw, legacy JSON, or a legacy .db"
      >
        <input
          type="file"
          multiple
          accept=".sqlite,.db,.json,.excalidraw,.zip"
          className="hidden"
          id="settings-import-legacy"
          onChange={async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            const databaseFile = files.find(
              (f) => f.name.endsWith(".sqlite") || f.name.endsWith(".db"),
            );
            if (databaseFile) {
              if (files.length > 1) {
                setImportError({
                  isOpen: true,
                  message:
                    "Please import legacy database files separately from other files.",
                });
                e.target.value = "";
                return;
              }
              await verifyLegacyDbFile(databaseFile);
              e.target.value = "";
              return;
            }
            const result = await importLegacyFiles(files, null, () => {});
            if (result.failed > 0) {
              setImportError({
                isOpen: true,
                message: `Import complete with errors.\nSuccess: ${result.success}\nFailed: ${result.failed}\nErrors:\n${result.errors.join("\n")}`,
              });
            } else {
              setImportSuccess({
                isOpen: true,
                message: `Imported ${result.success} file(s).`,
              });
            }
            e.target.value = "";
          }}
        />
        <button
          onClick={() =>
            document.getElementById("settings-import-legacy")?.click()
          }
          disabled={legacyDbImportLoading}
          className={settingsButtonClass}
        >
          {legacyDbImportLoading ? "Verifying…" : "Choose files"}
        </button>
      </SettingsRow>

      <SettingsRow
        icon={<Info size={20} />}
        tileClassName="border-gray-200 bg-gray-50 text-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
        title="Version"
        description={
          buildLabel ? (
            <span className="font-bold uppercase tracking-wide text-red-500 dark:text-red-400">
              {buildLabel}
            </span>
          ) : undefined
        }
      >
        <span className="rounded-full border-2 border-black px-2.5 py-0.5 text-xs font-black dark:border-neutral-600 dark:text-neutral-200">
          {appVersion}
        </span>
      </SettingsRow>
    </div>
  </details>
);
