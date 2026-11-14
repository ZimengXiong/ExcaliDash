import type React from "react";
import {
  ArchiveRestore,
  ChevronRight,
  Info,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { SettingsRow, settingsButtonClass } from "./SettingsRow";
import { importLegacyFiles } from "../../utils/importUtils";
import { useLocale } from "../../context/useLocale";

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
}: AdvancedSettingsProps) => {
  const { t } = useLocale();
  return (
    <details className="group mt-10 overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3.5 text-sm font-bold text-slate-800 dark:text-neutral-200 sm:px-5 sm:text-base">
        <ChevronRight
          size={16}
          className="transition-transform group-open:rotate-90"
        />
        {t("settings.advanced")}
      </summary>
      <div className="divide-y divide-slate-100 border-t-2 border-slate-100 dark:divide-neutral-800 dark:border-neutral-800">
        <SettingsRow
          icon={<Upload size={20} />}
          tileClassName="border-black bg-blue-400 text-black dark:border-neutral-700 dark:bg-blue-400 dark:text-black"
          title={t("settings.importBackup")}
          description={t("settings.importBackupDescription")}
        >
          <input
            type="file"
            accept=".excalidash"
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
            {backupImportLoading
              ? t("settings.verifying")
              : t("settings.chooseFile")}
          </button>
        </SettingsRow>

        <SettingsRow
          icon={<ArchiveRestore size={20} />}
          tileClassName="border-black bg-amber-300 text-black dark:border-neutral-700 dark:bg-amber-400 dark:text-black"
          title={t("settings.legacyImport")}
          description={t("settings.legacyImportDescription")}
        >
          <input
            type="file"
            multiple
            accept=".sqlite,.db,.json,.excalidraw,.zip"
            className="hidden"
            id="settings-import-legacy"
            onChange={async (event) => {
              const files = Array.from(event.target.files || []);
              if (files.length === 0) return;
              const databaseFile = files.find(
                (file) =>
                  file.name.endsWith(".sqlite") || file.name.endsWith(".db"),
              );
              if (databaseFile) {
                if (files.length > 1) {
                  setImportError({
                    isOpen: true,
                    message: t("settings.errors.legacyDbSeparately"),
                  });
                } else {
                  await verifyLegacyDbFile(databaseFile);
                }
                event.target.value = "";
                return;
              }
              const result = await importLegacyFiles(files, null, () => {});
              if (result.failed > 0) {
                setImportError({
                  isOpen: true,
                  message: t("settings.importCompletedWithErrors", {
                    success: result.success,
                    failed: result.failed,
                    errors: result.errors.join("\n"),
                  }),
                });
              } else {
                setImportSuccess({
                  isOpen: true,
                  message: t("settings.importedFiles", {
                    count: result.success,
                  }),
                });
              }
              event.target.value = "";
            }}
          />
          <button
            onClick={() =>
              document.getElementById("settings-import-legacy")?.click()
            }
            disabled={legacyDbImportLoading}
            className={settingsButtonClass}
          >
            {legacyDbImportLoading
              ? t("settings.verifying")
              : t("settings.chooseFiles")}
          </button>
        </SettingsRow>

        <SettingsRow
          icon={<ShieldCheck size={20} />}
          tileClassName="border-black bg-slate-300 text-black dark:border-neutral-700 dark:bg-neutral-700 dark:text-white"
          title={authEnabled ? t("settings.authOn") : t("settings.authOff")}
          description={
            isManagedAuthMode
              ? t("settings.authManaged", { mode: authMode ?? "" })
              : authEnabled
                ? user?.role === "ADMIN"
                  ? t("settings.multiUserEnabled")
                  : t("settings.onlyAdminsCanDisable")
                : t("settings.singleUserMode")
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
                ? t("settings.disabling")
                : t("settings.enabling")
              : authEnabled
                ? t("settings.disable")
                : t("settings.enable")}
          </button>
        </SettingsRow>

        <SettingsRow
          icon={<Info size={20} />}
          tileClassName="border-black bg-gray-300 text-black dark:border-neutral-700 dark:bg-neutral-700 dark:text-white"
          title={t("settings.version")}
          description={
            buildLabel ? (
              <span className="font-bold text-red-500 dark:text-red-400">
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
};
