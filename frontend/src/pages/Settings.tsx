import React, { useCallback, useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { useNavigate } from "react-router-dom";
import * as api from "../api";
import type { Collection } from "../types";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { SettingsMainGrid } from "./settings/SettingsMainGrid";
import { AdvancedSettings } from "./settings/AdvancedSettings";
import { SettingsConfirmModals } from "./settings/SettingsConfirmModals";
import { ApiKeysCard } from "./profile/ApiKeysCard";
import { AiSettingsCard } from "./admin/AiSettingsCard";
import { useAiSettings } from "./admin/useAiSettings";
import { Toaster } from "sonner";
import { displayFontFamily } from "../utils/displayFont";
import {
  EXCALIDASH_REQUIRED_MESSAGE,
  isExcalidashFile,
} from "../utils/importUtils";
export const Settings: React.FC = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { authEnabled, user, authMode, retryAuthStatus } = useAuth();
  const isSingleUserOwner = authEnabled === false;
  const isAdmin = isSingleUserOwner || user?.role === "ADMIN";
  const mustResetPassword = Boolean(user?.mustResetPassword);
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [authToggleLoading, setAuthToggleLoading] = useState(false);
  const [authToggleError, setAuthToggleError] = useState<string | null>(null);
  const setAiError = useCallback(
    (message: string) => setAuthToggleError(message || null),
    [],
  );
  const aiSettings = useAiSettings({
    authEnabled,
    setError: setAiError,
    onFeatureFlagChanged: retryAuthStatus,
  });
  const [authToggleConfirm, setAuthToggleConfirm] = useState<{
    isOpen: boolean;
    nextEnabled: boolean | null;
  }>({ isOpen: false, nextEnabled: null });
  const [authDisableFinalConfirmOpen, setAuthDisableFinalConfirmOpen] =
    useState(false);
  const [backupImportConfirmation, setBackupImportConfirmation] = useState<{
    isOpen: boolean;
    file: File | null;
    info: null | {
      formatVersion: number;
      exportedAt: string;
      excalidashBackendVersion: string | null;
      collections: number;
      drawings: number;
    };
  }>({ isOpen: false, file: null, info: null });
  const [backupImportLoading, setBackupImportLoading] = useState(false);
  const [backupImportSuccess, setBackupImportSuccess] = useState(false);
  const [backupImportError, setBackupImportError] = useState<{
    isOpen: boolean;
    message: string;
  }>({ isOpen: false, message: "" });
  const appVersion = import.meta.env.VITE_APP_VERSION || "Unknown version";
  const buildLabel = import.meta.env.VITE_APP_BUILD_LABEL;
  const isManagedAuthMode = authMode !== "local";
  const UPDATE_CHANNEL_KEY = "excalidash-update-channel";
  const UPDATE_INFO_KEY = "excalidash-update-info";
  const [updateChannel, setUpdateChannel] = useState<api.UpdateChannel>(() => {
    const raw =
      typeof window === "undefined"
        ? null
        : (window.localStorage?.getItem?.(UPDATE_CHANNEL_KEY) ?? null);
    return raw === "prerelease" ? "prerelease" : "stable";
  });
  const [updateInfo, setUpdateInfo] = useState<api.UpdateInfo | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const data = await api.getCollections();
        setCollections(data);
      } catch (err) {
        console.error("Failed to fetch collections:", err);
      }
    };
    fetchCollections();
  }, []);
  const COMPRESSION_ENABLED_KEY = "excalidash-image-compression";
  const [imageCompression, setImageCompression] = useState<boolean>(() => {
    const raw =
      typeof window === "undefined"
        ? null
        : window.localStorage?.getItem?.(COMPRESSION_ENABLED_KEY);
    return raw !== "false";
  });
  const toggleImageCompression = () => {
    const next = !imageCompression;
    try {
      window.localStorage?.setItem?.(COMPRESSION_ENABLED_KEY, String(next));
    } catch {
      // Ignore unavailable storage in private/embedded contexts.
    }
    setImageCompression(next);
  };
  const checkForUpdates = async (channel: api.UpdateChannel) => {
    setUpdateLoading(true);
    setUpdateError(null);
    try {
      const info = await api.getUpdateInfo(channel);
      setUpdateInfo(info);
      try {
        window.localStorage?.setItem?.(
          `${UPDATE_INFO_KEY}:${channel}`,
          JSON.stringify(info),
        );
      } catch {
        // Ignore unavailable storage in private/embedded contexts.
      }
    } catch (err: unknown) {
      let message = "Failed to check for updates";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setUpdateError(message);
    } finally {
      setUpdateLoading(false);
    }
  };
  useEffect(() => {
    void checkForUpdates(updateChannel);
  }, []);
  const setAuthEnabled = async (enabled: boolean) => {
    setAuthToggleLoading(true);
    setAuthToggleError(null);
    try {
      const response = await api.api.post<{
        authEnabled: boolean;
        bootstrapRequired?: boolean;
      }>("/auth/auth-enabled", { enabled });
      if (response.data.authEnabled) {
        window.location.href = response.data.bootstrapRequired
          ? "/register"
          : "/login";
        return;
      }
      window.location.reload();
    } catch (err: unknown) {
      let message = "Failed to update authentication setting";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setAuthToggleError(message);
    } finally {
      setAuthToggleLoading(false);
    }
  };
  const confirmToggleAuthEnabled = () => {
    if (authEnabled === null) return;
    if (authToggleLoading) return;
    setAuthToggleConfirm({ isOpen: true, nextEnabled: !authEnabled });
  };
  const exportBackup = async () => {
    try {
      const response = await api.api.get("/export/excalidash", {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      link.download = `excalidash-backup-${date}.excalidash`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("Backup export failed:", err);
      setBackupImportError({
        isOpen: true,
        message: "Failed to export backup. Please try again.",
      });
    }
  };
  const verifyBackupFile = async (file: File) => {
    if (!isExcalidashFile(file)) {
      setBackupImportError({
        isOpen: true,
        message: EXCALIDASH_REQUIRED_MESSAGE,
      });
      return;
    }
    setBackupImportLoading(true);
    try {
      const formData = new FormData();
      formData.append("archive", file);
      const response = await api.api.post<{
        valid: boolean;
        formatVersion: number;
        exportedAt: string;
        excalidashBackendVersion: string | null;
        collections: number;
        drawings: number;
      }>("/import/excalidash/verify", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBackupImportConfirmation({
        isOpen: true,
        file,
        info: {
          formatVersion: response.data.formatVersion,
          exportedAt: response.data.exportedAt,
          excalidashBackendVersion:
            response.data.excalidashBackendVersion ?? null,
          collections: response.data.collections,
          drawings: response.data.drawings,
        },
      });
    } catch (err: unknown) {
      console.error("Backup verify failed:", err);
      let message = "Failed to verify backup file.";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setBackupImportError({ isOpen: true, message });
    } finally {
      setBackupImportLoading(false);
    }
  };
  const handleCreateCollection = async (name: string) => {
    await api.createCollection(name);
    const newCollections = await api.getCollections();
    setCollections(newCollections);
  };
  const handleEditCollection = async (id: string, name: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );
    await api.updateCollection(id, name);
  };
  const handleDeleteCollection = async (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    await api.deleteCollection(id);
  };
  const handleSelectCollection = (id: string | null | undefined) => {
    if (id === undefined) navigate("/");
    else if (id === null) navigate("/collections?id=unorganized");
    else navigate(`/collections?id=${id}`);
  };
  return (
    <Layout
      collections={collections}
      selectedCollectionId="SETTINGS"
      onSelectCollection={handleSelectCollection}
      onCreateCollection={handleCreateCollection}
      onEditCollection={handleEditCollection}
      onDeleteCollection={handleDeleteCollection}
    >
      {" "}
      <div className="mx-auto w-full max-w-3xl">
      <Toaster position="top-right" />
      <h1
        className="text-3xl sm:text-4xl lg:text-5xl mb-6 lg:mb-8 text-slate-900 dark:text-white pl-1"
        style={{ fontFamily: displayFontFamily }}
      >
        {" "}
        Settings{" "}
      </h1>{" "}
      {authToggleError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
          {" "}
          <p className="text-red-800 dark:text-red-200 font-medium">
            {authToggleError}
          </p>{" "}
        </div>
      )}{" "}
      {settingsSuccess && (
        <div className="mb-6 rounded-xl border-2 border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="font-medium text-green-800 dark:text-green-200">
            {settingsSuccess}
          </p>
        </div>
      )}{" "}
      <div className="space-y-10">
        <ApiKeysCard
          disabled={mustResetPassword}
          onSuccess={setSettingsSuccess}
        />
        <AiSettingsCard
          readOnly={!isAdmin}
          enabled={aiSettings.enabled}
          loading={aiSettings.loading}
          saving={aiSettings.saving}
          providers={aiSettings.providers}
          defaultProviderId={aiSettings.defaultProviderId}
          status={aiSettings.status}
          providerDefinitions={aiSettings.providerDefinitions}
          onDefaultProviderChange={aiSettings.setDefaultProviderId}
          onAddProvider={aiSettings.addProvider}
          onUpdateProvider={aiSettings.updateProvider}
          onRemoveProvider={aiSettings.removeProvider}
          onSave={aiSettings.save}
          onEnabledChange={aiSettings.setEnabled}
        />
      </div>
      <div className="mt-10">
        <SettingsMainGrid
          exportBackup={exportBackup}
          theme={theme}
          toggleTheme={toggleTheme}
          imageCompression={imageCompression}
          toggleImageCompression={toggleImageCompression}
          updateChannel={updateChannel}
          updateInfo={updateInfo}
          updateLoading={updateLoading}
          updateError={updateError}
          onUpdateChannelChange={(next) => {
            try {
              window.localStorage?.setItem?.(UPDATE_CHANNEL_KEY, next);
            } catch {
              // Ignore unavailable storage in private/embedded contexts.
            }
            setUpdateChannel(next);
            void checkForUpdates(next);
          }}
          onCheckForUpdates={() => void checkForUpdates(updateChannel)}
        />
      </div>{" "}
      <AdvancedSettings
        authEnabled={authEnabled}
        authMode={authMode}
        authToggleLoading={authToggleLoading}
        backupImportLoading={backupImportLoading}
        isManagedAuthMode={isManagedAuthMode}
        user={user}
        appVersion={appVersion}
        buildLabel={buildLabel}
        verifyBackupFile={verifyBackupFile}
        confirmToggleAuthEnabled={confirmToggleAuthEnabled}
      />{" "}
      <SettingsConfirmModals
        authToggleConfirm={authToggleConfirm}
        setAuthToggleConfirm={setAuthToggleConfirm}
        authDisableFinalConfirmOpen={authDisableFinalConfirmOpen}
        setAuthDisableFinalConfirmOpen={setAuthDisableFinalConfirmOpen}
        setAuthEnabled={setAuthEnabled}
        backupImportConfirmation={backupImportConfirmation}
        setBackupImportConfirmation={setBackupImportConfirmation}
        backupImportSuccess={backupImportSuccess}
        setBackupImportSuccess={setBackupImportSuccess}
        backupImportError={backupImportError}
        setBackupImportError={setBackupImportError}
        setBackupImportLoading={setBackupImportLoading}
      />{" "}
      </div>
    </Layout>
  );
};
