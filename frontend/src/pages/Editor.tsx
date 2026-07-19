/* eslint-disable react-hooks/preserve-manual-memoization */ import React, { useCallback, useEffect, useState, useRef } from "react";
import { restoreElements } from "@excalidraw/excalidraw";
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
import { ChatPanel } from "./editor/ChatPanel";
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
import { DEFAULT_GRID_STEP } from "../components/GridStepSelector";
import { captureAgentCanvas } from "./editor/captureAgentCanvas";
import { normalizeTextElementDimensions } from "./editor/normalizeTextElements";
import { useEditorTextNormalization } from "./editor/useEditorTextNormalization";
import { useEditorRuntimeRefs } from "./editor/useEditorRuntimeRefs";
import { EditorEngineGate } from "./editor/EditorEngineGate";
export const Editor: React.FC = () => (
  <EditorEngineGate ExcalidrawEditor={ExcalidrawEditor} />
);
const ExcalidrawEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { user } = useAuth();
  const [accessLevel, setAccessLevel] = useState<
    "none" | "view" | "edit" | "owner"
  >("none");
  const canEdit = accessLevel === "edit" || accessLevel === "owner";
  const [drawingName, setDrawingName] = useState("Drawing Editor");
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [initialData, setInitialData] = useState<any>(null);
  const [isSceneLoading, setIsSceneLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSavingOnLeave, setIsSavingOnLeave] = useState(false);
  const { autoHideEnabled, setAutoHideEnabled } = useEditorAutoHide(id);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [langCode, setLangCode] = usePreference("language", getInitialLangCode());
  const [gridStep, setGridStep] = usePreference("gridStep", DEFAULT_GRID_STEP);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const previewBackup = useRef<{
    elements: readonly any[];
    appState: any;
    files: any;
  } | null>(null);
  const { isHeaderVisible, setIsHeaderVisible } = useEditorChrome({
    drawingName,
    autoHideEnabled,
    isRenaming,
  });
  const me: UserIdentity = useEditorIdentity(user);
  const [isReady, setIsReady] = useState(false);
  const {
    computeElementOrderSig,
    elementVersionMap,
    hasElementChanged,
    recordElementVersion,
  } = useEditorElementTracking();
  const {
    isBootstrappingScene, hasHydratedInitialScene, latestElementsRef,
    initialSceneElementsRef, latestFilesRef, lastSyncedFilesRef, lastSyncedElementOrderSigRef,
    lastPersistedFilesRef, uploadedFileRefsRef, onFileUploadCompleteRef, latestAppStateRef,
    debouncedSaveRef, currentDrawingVersionRef, lastPersistedElementsRef, saveQueueRef,
    suspiciousBlankLoadRef, libraryItemsRef, libraryVersionRef, libraryHydratedRef,
    hasSceneChangesSinceLoadRef, lastLocalChangeAtRef, editorContainerRef, excalidrawAPI,
    selfAgentBatchIdsRef,
  } = useEditorRuntimeRefs();
  const isUnmountingRef = useRef(false);
  const normalizeTextDimensions = useCallback(
    (elements: readonly any[]) =>
      normalizeTextElementDimensions(elements, restoreElements as any),
    [],
  );
  const { resolveSafeSnapshot, normalizeImageElementStatus } =
    useEditorSnapshotGuards({
      lastPersistedElementsRef,
      initialSceneElementsRef,
      latestElementsRef,
    });
  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
    };
  }, []);
  const handleSocketAccessDenied = useCallback(() => {
    if (!id || !location.pathname.startsWith("/editor/")) return;
    navigate(`/shared/${id}${location.search}${location.hash}`, {
      replace: true,
    });
  }, [id, location.hash, location.pathname, location.search, navigate]);
  const { peers, socketMeRef, socketRef, socket, isSyncing, onPointerUpdate } =
    useEditorCollaboration({
      drawingId: id,
      me,
      isReady,
      excalidrawAPI,
      editorContainerRef,
      lastSyncedFilesRef,
      lastSyncedElementOrderSigRef,
      latestElementsRef,
      latestFilesRef,
      computeElementOrderSig,
      recordElementVersion,
      normalizeTextElementDimensions: normalizeTextDimensions,
      onAccessDenied: handleSocketAccessDenied,
      selfAgentBatchIdsRef,
    });
  useEditorTextNormalization({
    isReady,
    excalidrawAPI,
    isSyncing,
    latestElementsRef,
    normalizeTextElementDimensions: normalizeTextDimensions,
    recordElementVersion,
  });
  const { scanNow: scanFileUploads } = useEditorFileUploads({
    drawingId: id,
    isReady,
    excalidrawAPI,
    isSyncing,
    latestFiles: latestFilesRef,
    uploadedRefs: uploadedFileRefsRef,
    onUploadCompleteRef: onFileUploadCompleteRef,
  });
  const { emitFilesDeltaIfNeeded, setExcalidrawAPI } = useEditorSceneApi({
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
    hasSceneChangesSinceLoadRef,
    uploadedRefs: uploadedFileRefsRef,
    scanFileUploads,
    setIsReady,
  });
  useEditorGridStep({ excalidrawAPI, isReady, gridStep });
  const persistenceRefs = React.useMemo(
    () => ({
      currentDrawingVersion: currentDrawingVersionRef, debouncedSave: debouncedSaveRef,
      excalidrawAPI,
      isSyncing,
      isUnmounting: isUnmountingRef,
      lastLocalChangeAt: lastLocalChangeAtRef, lastPersistedElements: lastPersistedElementsRef,
      lastPersistedFiles: lastPersistedFilesRef, lastSyncedFiles: lastSyncedFilesRef,
      latestAppState: latestAppStateRef, latestElements: latestElementsRef,
      latestFiles: latestFilesRef, saveQueue: saveQueueRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef, uploadedRefs: uploadedFileRefsRef,
      libraryItems: libraryItemsRef, libraryVersion: libraryVersionRef,
      libraryHydrated: libraryHydratedRef,
    }),
    [isSyncing],
  );
  const {
    autosaveFailing,
    debouncedSave,
    debouncedSaveLibrary,
    debouncedSavePreview,
    enqueueSceneSave,
    saveDataRef,
    savePreviewRef,
  } = useEditorPersistence({
    refs: persistenceRefs,
    user,
    normalizeImageElementStatus,
    resolveSafeSnapshot,
  });
  useLibraryImportFromUrl({
    excalidrawAPIRef: excalidrawAPI,
    isReady,
    user,
    libraryItemsRef,
    libraryVersionRef,
  });
  const markSceneChangedSinceLoad = useCallback(() => {
    hasSceneChangesSinceLoadRef.current = true;
  }, []);
  const broadcastChanges = useEditorBroadcast({
    drawingId: id,
    excalidrawAPI,
    lastLocalChangeAtRef,
    lastSyncedElementOrderSigRef,
    lastSyncedFilesRef,
    latestAppStateRef,
    latestFilesRef,
    socketMeRef,
    socketRef,
    uploadedRefs: uploadedFileRefsRef,
    debouncedSave,
    debouncedSavePreview,
    computeElementOrderSig,
    hasElementChanged,
    normalizeImageElementStatus,
    recordElementVersion,
    setHasSceneChangesSinceLoad: markSceneChangedSinceLoad,
  });
  useEffect(() => {
    onFileUploadCompleteRef.current = () => {
      const editor = excalidrawAPI.current;
      const elements =
        editor?.getSceneElementsIncludingDeleted?.() ?? latestElementsRef.current;
      broadcastChanges(elements, editor?.getFiles?.() ?? latestFilesRef.current);
    };
    return () => {
      onFileUploadCompleteRef.current = null;
    };
  }, [broadcastChanges]);
  const sceneLoaderRefs = React.useMemo(
    () => ({
      elementVersionMap,
      saveQueue: saveQueueRef, latestElements: latestElementsRef,
      initialSceneElements: initialSceneElementsRef, latestFiles: latestFilesRef,
      isSyncing,
      lastSyncedFiles: lastSyncedFilesRef, lastSyncedElementOrderSig: lastSyncedElementOrderSigRef,
      lastPersistedFiles: lastPersistedFilesRef, currentDrawingVersion: currentDrawingVersionRef,
      lastPersistedElements: lastPersistedElementsRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
      libraryItems: libraryItemsRef, libraryVersion: libraryVersionRef,
      libraryHydrated: libraryHydratedRef,
      hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
      excalidrawAPI,
      latestAppState: latestAppStateRef,
      isBootstrappingScene,
      hasHydratedInitialScene,
    }),
    [elementVersionMap, isSyncing],
  );
  useEditorSceneLoader({
    id,
    user,
    uploadedRefs: uploadedFileRefsRef,
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
    normalizeTextElementDimensions: normalizeTextDimensions,
  });
  const canvasHandlerRefs = React.useMemo(
    () => ({
      debouncedSave: debouncedSaveRef,
      excalidrawAPI,
      hasHydratedInitialScene,
      hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
      initialSceneElements: initialSceneElementsRef,
      isBootstrappingScene,
      isSyncing,
      isUnmounting: isUnmountingRef,
      lastLocalChangeAt: lastLocalChangeAtRef,
      latestAppState: latestAppStateRef,
      latestElements: latestElementsRef,
      latestFiles: latestFilesRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
    }),
    [isSyncing],
  );
  const { handleCanvasChange, handleCanvasDropCapture } =
    useEditorCanvasHandlers({
      canEdit: canEdit && !isHistoryOpen,
      debouncedSavePreview,
      drawingId: id,
      emitFilesDeltaIfNeeded,
      isReady,
      refs: canvasHandlerRefs,
      resolveSafeSnapshot,
      broadcastChanges,
    });
  const commandRefs = React.useMemo(
    () => ({
      currentDrawingVersion: currentDrawingVersionRef,
      excalidrawAPI,
      hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
      latestFiles: latestFilesRef,
      saveData: saveDataRef,
      savePreview: savePreviewRef,
      suspiciousBlankLoad: suspiciousBlankLoadRef,
      uploadedRefs: uploadedFileRefsRef,
      libraryItems: libraryItemsRef,
      libraryVersion: libraryVersionRef,
      libraryHydrated: libraryHydratedRef,
    }),
    [saveDataRef, savePreviewRef],
  );
  const {
    handleBackClick,
    handleExportClick,
    handleLibraryChange,
    handleRenameStart,
    handleRenameSubmit,
    handleToggleAutoHide,
  } = useEditorCommands({
    autoHideEnabled,
    canEdit,
    debouncedSaveLibrary,
    drawingId: id,
    drawingName,
    enqueueSceneSave,
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
    user,
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
        isRenaming={isRenaming}
        isSavingOnLeave={isSavingOnLeave}
        isSceneLoading={isSceneLoading}
        langCode={langCode}
        loadError={loadError}
        me={me}
        newName={newName}
        peers={peers}
        theme={theme}
        onBackClick={handleBackClick}
        onCanvasChange={handleCanvasChange}
        onCanvasDropCapture={handleCanvasDropCapture}
        onExportClick={handleExportClick}
        onLibraryChange={handleLibraryChange}
        onNavigateHome={() => navigate("/")}
        onNewNameChange={setNewName}
        onPointerUpdate={onPointerUpdate}
        onRenameBlur={() => setIsRenaming(false)}
        onRenameStart={handleRenameStart}
        onRenameSubmit={handleRenameSubmit}
        onSetExcalidrawAPI={setExcalidrawAPI}
        onSetLangCode={setLangCode}
        gridStep={gridStep}
        onSetGridStep={setGridStep}
        onShareOpen={() => setIsShareOpen(true)}
        onHistoryOpen={() => setIsHistoryOpen(true)}
        onToggleAutoHide={handleToggleAutoHide}
      />
      <EditorDialogs
        drawingId={id}
        drawingName={drawingName}
        getCurrentVersion={() => currentDrawingVersionRef.current}
        excalidrawAPIRef={excalidrawAPI}
        isHistoryOpen={isHistoryOpen}
        isShareOpen={isShareOpen}
        previewBackupRef={previewBackup}
        onCloseHistory={() => setIsHistoryOpen(false)}
        onCloseShare={() => setIsShareOpen(false)}
      />
      <ChatPanel
        drawingId={id}
        canView={accessLevel !== "none"}
        canEdit={canEdit}
        socket={socket}
        selfAgentBatchIdsRef={selfAgentBatchIdsRef}
        captureCanvasContext={() => captureAgentCanvas(excalidrawAPI.current)}
      />
    </>
  );
};
