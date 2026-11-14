import type React from "react";
import { ConfirmModal } from "../../components/ConfirmModal";
import * as api from "../../api";
import { useLocale } from "../../context/useLocale";
import { formatDateTime } from "../../i18n/format";

type LegacyDbImportConfirmation = {
  isOpen: boolean;
  file: File | null;
  info: null | {
    drawings: number;
    collections: number;
    legacyLatestMigration: string | null;
    currentLatestMigration: string | null;
  };
};

type BackupImportConfirmation = {
  isOpen: boolean;
  file: File | null;
  info: null | {
    formatVersion: number;
    exportedAt: string;
    excalidashBackendVersion: string | null;
    collections: number;
    drawings: number;
  };
};

type DialogState = { isOpen: boolean; message: string };
type SuccessDialogState = { isOpen: boolean; message: React.ReactNode };
type AuthToggleConfirm = { isOpen: boolean; nextEnabled: boolean | null };

type SettingsConfirmModalsProps = {
  legacyDbImportConfirmation: LegacyDbImportConfirmation;
  setLegacyDbImportConfirmation: React.Dispatch<
    React.SetStateAction<LegacyDbImportConfirmation>
  >;
  importError: DialogState;
  setImportError: React.Dispatch<React.SetStateAction<DialogState>>;
  importSuccess: SuccessDialogState;
  setImportSuccess: React.Dispatch<React.SetStateAction<SuccessDialogState>>;
  authToggleConfirm: AuthToggleConfirm;
  setAuthToggleConfirm: React.Dispatch<React.SetStateAction<AuthToggleConfirm>>;
  authDisableFinalConfirmOpen: boolean;
  setAuthDisableFinalConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAuthEnabled: (enabled: boolean) => Promise<void>;
  backupImportConfirmation: BackupImportConfirmation;
  setBackupImportConfirmation: React.Dispatch<
    React.SetStateAction<BackupImportConfirmation>
  >;
  backupImportSuccess: boolean;
  setBackupImportSuccess: React.Dispatch<React.SetStateAction<boolean>>;
  backupImportError: DialogState;
  setBackupImportError: React.Dispatch<React.SetStateAction<DialogState>>;
  setBackupImportLoading: React.Dispatch<React.SetStateAction<boolean>>;
};

export const SettingsConfirmModals = ({
  legacyDbImportConfirmation,
  setLegacyDbImportConfirmation,
  importError,
  setImportError,
  importSuccess,
  setImportSuccess,
  authToggleConfirm,
  setAuthToggleConfirm,
  authDisableFinalConfirmOpen,
  setAuthDisableFinalConfirmOpen,
  setAuthEnabled,
  backupImportConfirmation,
  setBackupImportConfirmation,
  backupImportSuccess,
  setBackupImportSuccess,
  backupImportError,
  setBackupImportError,
  setBackupImportLoading,
}: SettingsConfirmModalsProps) => {
  const { locale, t } = useLocale();
  return (
    <>
      <ConfirmModal
        isOpen={legacyDbImportConfirmation.isOpen}
        title={t("settings.legacyDb.title")}
        message={
          <div className="space-y-2 text-left">
            <div>{t("settings.legacyDb.description")}</div>
            {legacyDbImportConfirmation.info && (
              <div className="space-y-1 text-sm text-slate-700 dark:text-neutral-200">
                <div>
                  {t("settings.legacyDb.drawings", {
                    count: legacyDbImportConfirmation.info.drawings,
                  })}
                </div>
                <div>
                  {t("settings.legacyDb.collections", {
                    count: legacyDbImportConfirmation.info.collections,
                  })}
                </div>
                <div>
                  {t("settings.legacyDb.legacyMigration")}{" "}
                  {legacyDbImportConfirmation.info.legacyLatestMigration ||
                    t("common.unknown")}
                </div>
                <div>
                  {t("settings.legacyDb.currentMigration")}{" "}
                  {legacyDbImportConfirmation.info.currentLatestMigration ||
                    t("common.unknown")}
                </div>
              </div>
            )}
          </div>
        }
        confirmText={t("settings.legacyDb.confirm")}
        cancelText={t("common.cancel")}
        onConfirm={async () => {
          const file = legacyDbImportConfirmation.file;
          if (!file) return;
          setLegacyDbImportConfirmation({
            isOpen: false,
            file: null,
            info: null,
          });
          const formData = new FormData();
          formData.append("db", file);
          try {
            const response = await api.api.post<{
              collections: { created: number; updated: number };
              drawings: { created: number; updated: number };
            }>("/import/sqlite/legacy", formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            setImportSuccess({
              isOpen: true,
              message: t("settings.legacyDb.imported", {
                collectionsCreated: response.data.collections.created,
                collectionsUpdated: response.data.collections.updated,
                drawingsCreated: response.data.drawings.created,
                drawingsUpdated: response.data.drawings.updated,
              }),
            });
          } catch (err: unknown) {
            let message = t("settings.errors.importLegacyDb");
            if (api.isAxiosError(err)) {
              message =
                err.response?.data?.message ||
                err.response?.data?.error ||
                message;
            }
            setImportError({ isOpen: true, message });
          }
        }}
        onCancel={() =>
          setLegacyDbImportConfirmation({
            isOpen: false,
            file: null,
            info: null,
          })
        }
      />
      <ConfirmModal
        isOpen={importError.isOpen}
        title={t("settings.importFailed")}
        message={importError.message}
        confirmText={t("common.ok")}
        showCancel={false}
        isDangerous={false}
        onConfirm={() => setImportError({ isOpen: false, message: "" })}
        onCancel={() => setImportError({ isOpen: false, message: "" })}
      />
      <ConfirmModal
        isOpen={importSuccess.isOpen}
        title={t("settings.importSuccessful")}
        message={importSuccess.message}
        confirmText={t("common.ok")}
        showCancel={false}
        isDangerous={false}
        variant="success"
        onConfirm={() => setImportSuccess({ isOpen: false, message: "" })}
        onCancel={() => setImportSuccess({ isOpen: false, message: "" })}
      />
      <ConfirmModal
        isOpen={authToggleConfirm.isOpen}
        title={
          authToggleConfirm.nextEnabled
            ? t("settings.authToggle.enableTitle")
            : t("settings.authToggle.disableTitle")
        }
        message={
          authToggleConfirm.nextEnabled ? (
            t("settings.authToggle.enableMessage")
          ) : (
            <div className="space-y-2 text-left">
              <div>{t("settings.authToggle.disableMessage")}</div>
              <div className="font-semibold text-rose-700 dark:text-rose-300">
                {t("settings.authToggle.recommendation")}
              </div>
            </div>
          )
        }
        confirmText={
          authToggleConfirm.nextEnabled
            ? t("settings.enable")
            : t("common.continue")
        }
        cancelText={t("common.cancel")}
        isDangerous={!authToggleConfirm.nextEnabled}
        onConfirm={async () => {
          const nextEnabled = authToggleConfirm.nextEnabled;
          setAuthToggleConfirm({ isOpen: false, nextEnabled: null });
          if (typeof nextEnabled !== "boolean") return;
          if (!nextEnabled) {
            setAuthDisableFinalConfirmOpen(true);
            return;
          }
          await setAuthEnabled(nextEnabled);
        }}
        onCancel={() =>
          setAuthToggleConfirm({ isOpen: false, nextEnabled: null })
        }
      />
      <ConfirmModal
        isOpen={authDisableFinalConfirmOpen}
        title={t("settings.authFinal.title")}
        message={
          <div className="space-y-2 text-left">
            <div>{t("settings.authFinal.message")}</div>
            <div className="font-semibold text-rose-700 dark:text-rose-300">
              {t("settings.authFinal.trustedOnly")}
            </div>
          </div>
        }
        confirmText={t("authSetup.disable")}
        cancelText={t("settings.authFinal.keepEnabled")}
        isDangerous
        onConfirm={async () => {
          setAuthDisableFinalConfirmOpen(false);
          await setAuthEnabled(false);
        }}
        onCancel={() => setAuthDisableFinalConfirmOpen(false)}
      />
      <ConfirmModal
        isOpen={backupImportConfirmation.isOpen}
        title={t("settings.backup.confirmTitle")}
        message={
          backupImportConfirmation.info
            ? t("settings.backup.confirmMessage", {
                collections: backupImportConfirmation.info.collections,
                drawings: backupImportConfirmation.info.drawings,
                formatVersion: backupImportConfirmation.info.formatVersion,
                exportedAt: formatDateTime(
                  backupImportConfirmation.info.exportedAt,
                  locale,
                ),
              })
            : t("settings.backup.confirmMessageGeneric")
        }
        confirmText={t("settings.backup.import")}
        cancelText={t("common.cancel")}
        isDangerous={false}
        onConfirm={async () => {
          const file = backupImportConfirmation.file;
          if (!file) return;
          setBackupImportConfirmation({
            ...backupImportConfirmation,
            isOpen: false,
          });
          setBackupImportLoading(true);
          try {
            const formData = new FormData();
            formData.append("archive", file);
            await api.api.post("/import/excalidash", formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            setBackupImportConfirmation({
              isOpen: false,
              file: null,
              info: null,
            });
            setBackupImportSuccess(true);
          } catch (err: unknown) {
            console.error("Backup import failed:", err);
            let message = t("settings.errors.importBackup");
            if (api.isAxiosError(err)) {
              message =
                err.response?.data?.message ||
                err.response?.data?.error ||
                message;
            }
            setBackupImportError({ isOpen: true, message });
            setBackupImportConfirmation({
              isOpen: false,
              file: null,
              info: null,
            });
          } finally {
            setBackupImportLoading(false);
          }
        }}
        onCancel={() =>
          setBackupImportConfirmation({ isOpen: false, file: null, info: null })
        }
      />
      <ConfirmModal
        isOpen={backupImportSuccess}
        title={t("settings.backup.importedTitle")}
        message={t("settings.backup.importedMessage")}
        confirmText={t("common.ok")}
        showCancel={false}
        isDangerous={false}
        variant="success"
        onConfirm={() => setBackupImportSuccess(false)}
        onCancel={() => setBackupImportSuccess(false)}
      />
      <ConfirmModal
        isOpen={backupImportError.isOpen}
        title={t("settings.backup.failedTitle")}
        message={backupImportError.message}
        confirmText={t("common.ok")}
        cancelText=""
        showCancel={false}
        isDangerous={false}
        onConfirm={() => setBackupImportError({ isOpen: false, message: "" })}
        onCancel={() => setBackupImportError({ isOpen: false, message: "" })}
      />
    </>
  );
};
