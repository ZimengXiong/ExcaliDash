import type React from "react";
import { ConfirmModal } from "../../components/ConfirmModal";
import * as api from "../../api";

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
type AuthToggleConfirm = { isOpen: boolean; nextEnabled: boolean | null };

type SettingsConfirmModalsProps = {
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
}: SettingsConfirmModalsProps) => (
  <>
    <ConfirmModal
      isOpen={authToggleConfirm.isOpen}
      title={
        authToggleConfirm.nextEnabled
          ? "Enable authentication?"
          : "Disable authentication?"
      }
      message={
        authToggleConfirm.nextEnabled ? (
          "This will require users to sign in. You will be prompted to set up an admin account immediately."
        ) : (
          <div className="space-y-2 text-left">
            <div>
              This will turn off authentication for the entire instance.
            </div>
            <div className="font-semibold text-rose-700 dark:text-rose-300">
              Recommendation: keep authentication enabled unless this instance
              is fully private.
            </div>
          </div>
        )
      }
      confirmText={authToggleConfirm.nextEnabled ? "Enable" : "Continue"}
      cancelText="Cancel"
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
      title="Final warning: disable authentication?"
      message={
        <div className="space-y-2 text-left">
          <div>
            With authentication off, any user who can access this URL can view
            and modify all drawings and settings. They can also turn
            authentication back on and lock you out.
          </div>
          <div className="font-semibold text-rose-700 dark:text-rose-300">
            This is only safe on a trusted private network.
          </div>
        </div>
      }
      confirmText="Disable Authentication"
      cancelText="Keep Enabled (Recommended)"
      isDangerous
      onConfirm={async () => {
        setAuthDisableFinalConfirmOpen(false);
        await setAuthEnabled(false);
      }}
      onCancel={() => setAuthDisableFinalConfirmOpen(false)}
    />
    <ConfirmModal
      isOpen={backupImportConfirmation.isOpen}
      title="Import backup?"
      message={
        backupImportConfirmation.info
          ? `This will merge ${backupImportConfirmation.info.collections} collection(s) and ${backupImportConfirmation.info.drawings} drawing(s) from a Format v${backupImportConfirmation.info.formatVersion} backup exported at ${backupImportConfirmation.info.exportedAt}.`
          : "This will merge the backup into your account."
      }
      confirmText="Import"
      cancelText="Cancel"
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
          let message = "Failed to import backup.";
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
      title="Backup Imported"
      message="Backup imported successfully."
      confirmText="OK"
      showCancel={false}
      isDangerous={false}
      variant="success"
      onConfirm={() => setBackupImportSuccess(false)}
      onCancel={() => setBackupImportSuccess(false)}
    />
    <ConfirmModal
      isOpen={backupImportError.isOpen}
      title="Backup Import Failed"
      message={backupImportError.message}
      confirmText="OK"
      cancelText=""
      showCancel={false}
      isDangerous={false}
      onConfirm={() => setBackupImportError({ isOpen: false, message: "" })}
      onCancel={() => setBackupImportError({ isOpen: false, message: "" })}
    />
  </>
);
