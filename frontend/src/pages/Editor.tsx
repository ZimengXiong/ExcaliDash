import "@excalidraw/excalidraw/index.css";
import * as api from "../api";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getInitialLangCode } from "../components/LanguageSelector";
import type { UserIdentity } from "../utils/identity";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { usePreference } from "../context/PreferencesContext";
import { useEditorChrome } from "./editor/useEditorChrome";
import { useEditorAutoHide } from "./editor/useEditorAutoHide";
import { useEditorIdentity } from "./editor/useEditorIdentity";
import { EditorDialogs } from "./editor/EditorDialogs";
import { EditorView } from "./editor/EditorView";
import { useLibraryImportFromUrl } from "./editor/useLibraryImportFromUrl";
import { useEditorSnapshotGuards } from "./editor/useEditorSnapshotGuards";
import { useEditorSceneLoader } from "./editor/useEditorSceneLoader";
import { useEditorCollaboration } from "./editor/useEditorCollaboration";
import { useEditorPersistence } from "./editor/useEditorPersistence";
import { useEditorCanvasHandlers } from "./editor/useEditorCanvasHandlers";
import { useEditorCommands } from "./editor/useEditorCommands";
import { useEditorElementTracking } from "./editor/useEditorElementTracking";
import { useEditorBroadcast } from "./editor/useEditorBroadcast";
import { useEditorFileUploads } from "./editor/useEditorFileUploads";
import { useEditorSceneApi } from "./editor/useEditorSceneApi";
import { useEditorGridStep } from "./editor/useEditorGridStep";
import { useKeyboardLayoutFix } from "./editor/useKeyboardLayoutFix";
import { DEFAULT_GRID_STEP } from "../components/GridStepSelector";

export const Editor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  // Keep a departing drawing's queue and refs alive for its unmount flush,
  // while the next drawing starts with its own scene, version and permissions.
  return <ExcalidrawEditor key={id} />;
};

const ExcalidrawEditor: React.FC = () => {
  useKeyboardLayoutFix();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [accessLevel, setAccessLevel] = useState<
    "none" | "view" | "edit" | "owner"
  >("none");
  const canEdit = accessLevel === "edit" || accessLevel === "owner";
  const [drawingName, setDrawingName] = useState(() =>
    typeof location.state?.drawingName === "string"
      ? location.state.drawingName
      : "Drawing Editor",
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [initialData, setInitialData] = useState<any>(null);
  const [isSceneLoading, setIsSceneLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingOnLeave, setIsSavingOnLeave] = useState(false);
  const [editorAutoHide] = usePreference("editorAutoHide", false);
  const [appendDroppedDrawings] = usePreference("appendDroppedDrawings", false);
  const { autoHideEnabled, setAutoHideEnabled } = useEditorAutoHide(
    id,
    editorAutoHide,
  );
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [langCode, setLangCode] = usePreference(
    "language",
    getInitialLangCode(),
  );
  const [gridStep, setGridStep] = usePreference("gridStep", DEFAULT_GRID_STEP);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const [historyPreview, setHistoryPreview] =
    useState<api.DrawingSnapshotFull | null>(null);
  const { isHeaderVisible, setIsHeaderVisible } = useEditorChrome({
    drawingName,
    autoHideEnabled,
    isRenaming,
    isShareOpen,
  });
  const me: UserIdentity = useEditorIdentity(user);
  const [isReady, setIsReady] = useState(false);
  const { elementVersionMap, hasElementChanged, recordElementVersion } =
    useEditorElementTracking();
  const isBootstrappingScene = useRef(true);
  const hasHydratedInitialScene = useRef(false);
  const isUnmounting = useRef(false);
  const latestElementsRef = useRef<readonly any[]>([]);
  const initialSceneElementsRef = useRef<readonly any[]>([]);
  const latestFilesRef = useRef<any>(null);
  const lastSyncedFilesRef = useRef<Record<string, any>>({});
  const lastSyncedElementOrderRef = useRef<readonly string[] | null>(null);
  const lastPersistedFilesRef = useRef<Record<string, any>>({});
  // fileId -> stored ref URL for images uploaded via the per-file endpoint.
  const uploadedFileRefsRef = useRef<Record<string, string>>({});
  const latestAppStateRef = useRef<any>(null);
  const debouncedSaveRef = useRef<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => void)
    | null
  >(null);
  const currentDrawingVersionRef = useRef<number | null>(null);
  const lastPersistedElementsRef = useRef<readonly any[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const suspiciousBlankLoadRef = useRef(false);
  const hasSceneChangesSinceLoadRef = useRef(false);
  const localSceneRevisionRef = useRef(0);
  const savedSceneRevisionRef = useRef(0);
  const markSceneChanged = useCallback(() => {
    hasSceneChangesSinceLoadRef.current = true;
    localSceneRevisionRef.current++;
  }, []);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const excalidrawAPI = useRef<any>(null);
  const { resolveSafeSnapshot, normalizeImageElementStatus } =
    useEditorSnapshotGuards({
      lastPersistedElementsRef,
      initialSceneElementsRef,
      latestElementsRef,
    });
  useEffect(() => {
    isUnmounting.current = false;
    return () => {
      isUnmounting.current = true;
    };
  }, []);
  const handleSocketAccessDenied = useCallback(() => {
    if (!id || !location.pathname.startsWith("/editor/")) return;
    navigate(`/shared/${id}${location.search}${location.hash}`, {
      replace: true,
    });
  }, [id, location.hash, location.pathname, location.search, navigate]);
  const handleReadOnly = useCallback(() => setAccessLevel("view"), []);
  const {
    peers,
    followedUserId,
    toggleFollow,
    socketMeRef,
    socketRef,
    isSyncing,
    onPointerUpdate,
  } = useEditorCollaboration({
    drawingId: id,
    me,
    isReady,
    excalidrawAPI,
    lastSyncedFilesRef,
    lastSyncedElementOrderRef,
    latestElementsRef,
    latestFilesRef,
    recordElementVersion,
    onAccessDenied: handleSocketAccessDenied,
    currentDrawingVersionRef,
    onReadOnly: handleReadOnly,
    latestAppStateRef,
  });
  const { scanNow: scanFileUploads } = useEditorFileUploads({
    canEdit,
    drawingId: id,
    isReady,
    excalidrawAPI,
    latestFiles: latestFilesRef,
    uploadedRefs: uploadedFileRefsRef,
  });
  const { emitFilesDeltaIfNeeded, fitInitialScene, setExcalidrawAPI } =
    useEditorSceneApi({
      canEdit,
      drawingId: id,
      excalidrawAPIRef: excalidrawAPI,
      isSyncing,
      socketRef,
      socketMeRef,
      lastSyncedFilesRef,
      latestFilesRef,
      latestElementsRef,
      latestAppStateRef,
      debouncedSaveRef,
      markSceneChanged,
      uploadedRefs: uploadedFileRefsRef,
      scanFileUploads,
      setIsReady,
    });
  useEditorGridStep({ excalidrawAPI, isReady, gridStep });
  const persistenceRefs = React.useMemo(
    () => ({
      currentDrawingVersion: currentDrawingVersionRef,
      debouncedSave: debouncedSaveRef,
      excalidrawAPI,
      isSyncing,
      isUnmounting,
      localSceneRevision: localSceneRevisionRef,
      savedSceneRevision: savedSceneRevisionRef,
      lastPersistedElements: lastPersistedElementsRef,
      lastPersistedFiles: lastPersistedFilesRef,
      lastSyncedFiles: lastSyncedFilesRef,
      latestAppState: latestAppStateRef,
      latestElements: latestElementsRef,
      latestFiles: latestFilesRef,
      saveQueue: saveQueueRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
      uploadedRefs: uploadedFileRefsRef,
      socket: socketRef,
    }),
    [isSyncing, socketRef],
  );
  const {
    autosaveFailing,
    debouncedSave,
    debouncedSaveLibrary,
    debouncedSavePreview,
    enqueueSceneSave,
    saveDataRef,
    savePreviewRef,
    historyRestorePendingRef,
    runHistoryRestore,
  } = useEditorPersistence({
    drawingId: id,
    canEdit,
    refs: persistenceRefs,
    user,
    normalizeImageElementStatus,
    resolveSafeSnapshot,
    onReadOnly: handleReadOnly,
  });
  const { broadcastChanges, flushBroadcastChanges } = useEditorBroadcast({
    drawingId: id,
    excalidrawAPI,
    lastSyncedElementOrderRef,
    lastSyncedFilesRef,
    latestAppStateRef,
    latestFilesRef,
    socketMeRef,
    socketRef,
    uploadedRefs: uploadedFileRefsRef,
    debouncedSave,
    debouncedSavePreview,
    hasElementChanged,
    recordElementVersion,
    markSceneChanged,
  });
  const sceneLoaderRefs = React.useMemo(
    () => ({
      elementVersionMap,
      saveQueue: saveQueueRef,
      latestElements: latestElementsRef,
      initialSceneElements: initialSceneElementsRef,
      latestFiles: latestFilesRef,
      isSyncing,
      lastSyncedFiles: lastSyncedFilesRef,
      lastSyncedElementOrder: lastSyncedElementOrderRef,
      lastPersistedFiles: lastPersistedFilesRef,
      currentDrawingVersion: currentDrawingVersionRef,
      lastPersistedElements: lastPersistedElementsRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
      hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
      localSceneRevision: localSceneRevisionRef,
      savedSceneRevision: savedSceneRevisionRef,
      excalidrawAPI,
      latestAppState: latestAppStateRef,
      isBootstrappingScene,
      hasHydratedInitialScene,
    }),
    [elementVersionMap, isSyncing],
  );
  const handleLibraryChange = useEditorSceneLoader({
    id,
    user,
    isReady,
    canEdit,
    debouncedSaveLibrary,
    location,
    navigate,
    refs: sceneLoaderRefs,
    setAccessLevel,
    setDrawingName,
    setInitialData,
    setIsReady,
    setIsSceneLoading,
    setLoadError,
    recordElementVersion,
    normalizeImageElementStatus,
  });
  useLibraryImportFromUrl({ excalidrawAPIRef: excalidrawAPI, isReady, user });
  const canvasHandlerRefs = React.useMemo(
    () => ({
      debouncedSave: debouncedSaveRef,
      excalidrawAPI,
      hasHydratedInitialScene,
      initialSceneElements: initialSceneElementsRef,
      isBootstrappingScene,
      isSyncing,
      isUnmounting,
      latestAppState: latestAppStateRef,
      latestElements: latestElementsRef,
      latestFiles: latestFilesRef,
      lastPersistedElements: lastPersistedElementsRef,
      lastPersistedFiles: lastPersistedFilesRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
    }),
    [isSyncing],
  );
  const { handleCanvasChange, handleCanvasDropCapture } =
    useEditorCanvasHandlers({
      appendDroppedDrawings,
      canEdit,
      debouncedSavePreview,
      drawingId: id,
      emitFilesDeltaIfNeeded,
      isReady,
      markSceneChanged,
      refs: canvasHandlerRefs,
      resolveSafeSnapshot,
      broadcastChanges,
    });
  const handleSceneChange = useCallback<typeof handleCanvasChange>(
    (elements, appState, files) => {
      fitInitialScene(appState);
      handleCanvasChange(elements, appState, files);
    },
    [fitInitialScene, handleCanvasChange],
  );
  const commandRefs = React.useMemo(
    () => ({
      currentDrawingVersion: currentDrawingVersionRef,
      historyRestorePending: historyRestorePendingRef,
      excalidrawAPI,
      hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
      localSceneRevision: localSceneRevisionRef,
      savedSceneRevision: savedSceneRevisionRef,
      latestAppState: latestAppStateRef,
      latestElements: latestElementsRef,
      latestFiles: latestFilesRef,
      lastPersistedElements: lastPersistedElementsRef,
      lastPersistedFiles: lastPersistedFilesRef,
      saveData: saveDataRef,
      savePreview: savePreviewRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
      uploadedRefs: uploadedFileRefsRef,
    }),
    [historyRestorePendingRef, saveDataRef, savePreviewRef],
  );
  const {
    handleBackClick,
    handleBackIntent,
    handleExportClick,
    handleRenameStart,
    handleRenameSubmit,
    handleToggleAutoHide,
  } = useEditorCommands({
    autoHideEnabled,
    canEdit,
    drawingId: id,
    drawingName,
    enqueueSceneSave,
    flushBroadcastChanges,
    isSavingOnLeave,
    newName,
    refs: commandRefs,
    resolveSafeSnapshot,
    setAutoHideEnabled,
    setDrawingName,
    setIsHeaderVisible,
    setIsRenaming,
    setIsSavingOnLeave,
    setNewName,
  });

  return (
    <>
      <EditorView
        id={id}
        accessLevel={accessLevel}
        autoHideEnabled={autoHideEnabled}
        autosaveFailing={autosaveFailing}
        canEdit={canEdit}
        drawingName={drawingName}
        editorContainerRef={editorContainerRef}
        initialData={initialData}
        isHeaderVisible={isHeaderVisible}
        isHistoryOpen={isHistoryOpen}
        historyPreview={isHistoryOpen ? historyPreview : null}
        historyButtonRef={historyButtonRef}
        shareButtonRef={shareButtonRef}
        isRenaming={isRenaming}
        isSavingOnLeave={isSavingOnLeave}
        isSceneLoading={isSceneLoading}
        langCode={langCode}
        loadError={loadError}
        me={me}
        newName={newName}
        peers={peers}
        followedUserId={followedUserId}
        onToggleFollow={toggleFollow}
        theme={theme}
        onBackClick={handleBackClick}
        onBackIntent={handleBackIntent}
        onCanvasChange={handleSceneChange}
        onCanvasDropCapture={handleCanvasDropCapture}
        onExportClick={handleExportClick}
        onLibraryChange={handleLibraryChange}
        onNavigateHome={() => navigate("/")}
        onNewNameChange={setNewName}
        onPointerUpdate={onPointerUpdate}
        onRenameCancel={() => setIsRenaming(false)}
        onRenameStart={handleRenameStart}
        onRenameSubmit={handleRenameSubmit}
        onSetExcalidrawAPI={setExcalidrawAPI}
        onSetLangCode={setLangCode}
        gridStep={gridStep}
        onSetGridStep={setGridStep}
        onShareOpen={() => setIsShareOpen(true)}
        isShareOpen={isShareOpen}
        onCloseShare={() => setIsShareOpen(false)}
        onHistoryOpen={() => setIsHistoryOpen(true)}
        onToggleAutoHide={handleToggleAutoHide}
        onToggleTheme={toggleTheme}
      />
      <EditorDialogs
        drawingId={id}
        historyButtonRef={historyButtonRef}
        getCurrentVersion={() => currentDrawingVersionRef.current}
        isHistoryOpen={isHistoryOpen}
        onPreviewHistory={setHistoryPreview}
        onRestoreSnapshot={(snapshotId) =>
          runHistoryRestore(
            id!,
            () => api.restoreDrawingSnapshot(id!, snapshotId),
            flushBroadcastChanges,
          )
        }
        onCloseHistory={() => setIsHistoryOpen(false)}
      />
    </>
  );
};
