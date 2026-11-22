import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as api from "../../api";
import { exportFromEditor } from "../../utils/exportUtils";
import {
  applyUploadedFileRefs,
  getPersistedAppState,
  hasRenderableElements,
} from "./shared";
import type { UploadedFileRefs } from "./shared";
import { saveDrawingKeepalive } from "./keepaliveSave";
import { DrawingAccessLostError } from "./useEditorPersistence";
import type { SavePreviewOptions } from "./useEditorPersistence";

// Resolves after the next frame; the timeout covers hidden tabs, where
// requestAnimationFrame does not fire.
const nextPaint = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 50);
    window.requestAnimationFrame?.(() => window.setTimeout(resolve, 0));
  });

type EditorCommandRefs = {
  historyRestorePending: MutableRefObject<boolean>;
  currentDrawingVersion: MutableRefObject<number | null>;
  excalidrawAPI: MutableRefObject<any>;
  hasSceneChangesSinceLoad: MutableRefObject<boolean>;
  localSceneRevision: MutableRefObject<number>;
  savedSceneRevision: MutableRefObject<number>;
  latestAppState: MutableRefObject<any>;
  latestElements: MutableRefObject<readonly any[]>;
  latestFiles: MutableRefObject<any>;
  lastPersistedElements?: MutableRefObject<readonly any[]>;
  lastPersistedFiles?: MutableRefObject<Record<string, any>>;
  saveData: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => Promise<void>)
    | null
  >;
  savePreview: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files: any,
        options?: SavePreviewOptions,
      ) => Promise<void>)
    | null
  >;
  suspiciousBlankLoad: MutableRefObject<boolean>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
};

type UseEditorCommandsParams = {
  autoHideEnabled: boolean;
  canEdit: boolean;
  drawingId: string | undefined;
  drawingName: string;
  isSavingOnLeave: boolean;
  newName: string;
  refs: EditorCommandRefs;
  resolveSafeSnapshot: (candidateSnapshot?: readonly any[]) => {
    snapshot: readonly any[];
    prevented: boolean;
    staleEmptySnapshot: boolean;
    staleNonRenderableSnapshot: boolean;
  };
  enqueueSceneSave: (
    drawingId: string,
    elements: readonly any[],
    appState: any,
    files?: Record<string, any>,
    options?: { suppressErrors?: boolean; onlyIfDirty?: boolean },
  ) => Promise<void>;
  flushBroadcastChanges: () => void;
  setAutoHideEnabled: (enabled: boolean) => void;
  setDrawingName: (name: string) => void;
  setIsHeaderVisible: (visible: boolean) => void;
  setIsRenaming: (isRenaming: boolean) => void;
  setIsSavingOnLeave: (isSaving: boolean) => void;
  setNewName: (name: string) => void;
};

export const useEditorCommands = ({
  autoHideEnabled,
  canEdit,
  drawingId,
  drawingName,
  enqueueSceneSave,
  flushBroadcastChanges,
  isSavingOnLeave,
  newName,
  refs,
  resolveSafeSnapshot,
  setAutoHideEnabled,
  setDrawingName,
  setIsHeaderVisible,
  setIsRenaming,
  setIsSavingOnLeave,
  setNewName,
}: UseEditorCommandsParams) => {
  const navigate = useNavigate();
  const hasUnsavedChanges = useCallback(
    () => refs.localSceneRevision.current !== refs.savedSceneRevision.current,
    [refs],
  );

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!canEdit || refs.historyRestorePending.current) return;
        if (!(
          refs.excalidrawAPI.current &&
          refs.saveData.current &&
          refs.savePreview.current
        )) {
          return;
        }
        if (!drawingId) return;
        flushBroadcastChanges();
        const elements =
          refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
        const { snapshot: safeElements } = resolveSafeSnapshot(elements);
        const appState = refs.excalidrawAPI.current.getAppState();
        const files = refs.excalidrawAPI.current.getFiles() || {};
        refs.latestFiles.current = files;
        try {
          await enqueueSceneSave(drawingId, safeElements, appState, files, {
            suppressErrors: false,
          });
          const committedElements =
            refs.lastPersistedElements?.current ?? safeElements;
          const committedAppState =
            refs.excalidrawAPI.current?.getAppState() ?? appState;
          const committedFiles = refs.lastPersistedFiles?.current ?? files;
          refs.savePreview.current(
            drawingId,
            committedElements,
            committedAppState,
            committedFiles,
            {
              expectedVersion: refs.currentDrawingVersion.current,
              useSuppliedSnapshot: true,
            },
          );
          toast.success("Saved changes to server");
        } catch (err) {
          console.error("Failed to save on Ctrl+S", err);
          // enqueueSceneSave surfaces its own conflict/error toast; avoid a
          // false "Saved" confirmation when the save actually failed.
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canEdit,
    drawingId,
    enqueueSceneSave,
    flushBroadcastChanges,
    refs,
    resolveSafeSnapshot,
  ]);

  useEffect(() => {
    // Flush the latest scene when the tab is being hidden/closed. Debounced
    // autosave may have pending edits that would otherwise be lost; a
    // keepalive PUT survives the unload where the normal save pipeline can't.
    const handlePageHide = () => {
      if (!canEdit || !drawingId || refs.historyRestorePending.current) return;
      const editor = refs.excalidrawAPI.current;
      if (!editor) return;
      flushBroadcastChanges();
      if (!hasUnsavedChanges()) return;
      const elements = editor.getSceneElementsIncludingDeleted();
      const { snapshot: safeElements } = resolveSafeSnapshot(elements);
      if (
        refs.suspiciousBlankLoad.current &&
        !hasRenderableElements(safeElements)
      ) {
        return;
      }
      const appState = editor.getAppState();
      const files = editor.getFiles() || {};
      saveDrawingKeepalive(drawingId, {
        elements: Array.from(safeElements),
        appState: getPersistedAppState(appState),
        // Same slimmed shape as the debounced save: uploaded images ship as a
        // ref, un-uploaded ones stay inline (server interns them on receipt).
        files: applyUploadedFileRefs(files, refs.uploadedRefs.current),
        version: refs.currentDrawingVersion.current ?? undefined,
      });
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [
    canEdit,
    drawingId,
    flushBroadcastChanges,
    hasUnsavedChanges,
    refs,
    resolveSafeSnapshot,
  ]);

  const handleRenameSubmit = useCallback(async () => {
    if (!canEdit || !drawingId || refs.historyRestorePending.current) {
      setIsRenaming(false);
      return;
    }
    const trimmed = newName.trim();
    // Empty or unchanged name: just close the editor, save nothing.
    if (!trimmed || trimmed === drawingName) {
      setIsRenaming(false);
      return;
    }
    const previousName = drawingName;
    // Optimistically show the trimmed name, but revert if the save fails so
    // the header never diverges from what is actually persisted.
    setDrawingName(trimmed);
    setNewName(trimmed);
    setIsRenaming(false);
    try {
      await api.updateDrawing(drawingId, { name: trimmed });
    } catch (err) {
      console.error("Failed to rename", err);
      setDrawingName(previousName);
      toast.error("Failed to rename drawing");
    }
  }, [
    canEdit,
    drawingId,
    drawingName,
    newName,
    refs,
    setDrawingName,
    setIsRenaming,
    setNewName,
  ]);

  // Hovering Back starts the pending autosave early, so by the time the click
  // lands the scene is usually persisted and navigation doesn't wait on it.
  const backIntentSavePending = useRef(false);
  const handleBackIntent = useCallback(() => {
    if (
      !canEdit ||
      !drawingId ||
      isSavingOnLeave ||
      backIntentSavePending.current ||
      refs.historyRestorePending.current
    )
      return;
    const editor = refs.excalidrawAPI.current;
    if (!editor) return;
    flushBroadcastChanges();
    if (!hasUnsavedChanges()) return;
    backIntentSavePending.current = true;
    void enqueueSceneSave(
      drawingId,
      editor.getSceneElementsIncludingDeleted(),
      editor.getAppState(),
      editor.getFiles() || {},
      { onlyIfDirty: true },
    ).finally(() => {
      backIntentSavePending.current = false;
    });
  }, [
    canEdit,
    drawingId,
    enqueueSceneSave,
    flushBroadcastChanges,
    hasUnsavedChanges,
    isSavingOnLeave,
    refs,
  ]);

  const handleBackClick = useCallback(async () => {
    if (isSavingOnLeave || refs.historyRestorePending.current) return;
    const editor = refs.excalidrawAPI.current;
    if (!editor || !canEdit || !drawingId) {
      navigate("/");
      return;
    }

    flushBroadcastChanges();
    if (hasUnsavedChanges()) {
      setIsSavingOnLeave(true);
      try {
        // Paint the "Saving changes" state before sampling and serializing
        // the scene, so the click acknowledges immediately.
        await nextPaint();
        let revision: number;
        do {
          revision = refs.localSceneRevision.current;
          const { snapshot: safeElements } = resolveSafeSnapshot(
            editor.getSceneElementsIncludingDeleted(),
          );
          if (
            refs.suspiciousBlankLoad.current &&
            !hasRenderableElements(safeElements)
          ) {
            toast.warning(
              "Blank scene detected on load. Skipping save to protect existing data.",
            );
            break;
          }
          const files = editor.getFiles() || {};
          await enqueueSceneSave(
            drawingId,
            safeElements,
            editor.getAppState(),
            files,
            {
              suppressErrors: false,
              onlyIfDirty: true,
            },
          );
          flushBroadcastChanges();
        } while (
          revision !== refs.localSceneRevision.current &&
          hasUnsavedChanges()
        );
      } catch (err) {
        if (
          err instanceof DrawingAccessLostError ||
          (api.isAxiosError(err) && err.response?.status === 404)
        ) {
          // The scene save already reported the deletion or lost access.
          navigate("/");
        } else {
          console.error("Failed to save on back navigation", err);
          toast.error("Failed to save changes. Please retry before leaving.");
          setIsSavingOnLeave(false);
        }
        return;
      }
    }

    navigate("/");
    const savePreview = refs.savePreview.current;
    const appState = refs.latestAppState.current;
    if (!refs.hasSceneChangesSinceLoad.current || !savePreview || !appState)
      return;
    const elements = refs.latestElements.current;
    const files = refs.latestFiles.current || {};
    // The committed version this render depicts; a newer save wins.
    const expectedVersion = refs.currentDrawingVersion.current;
    const updatePreview = () =>
      void savePreview(drawingId, elements, appState, files, {
        expectedVersion,
      });
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(updatePreview, { timeout: 2000 });
    } else {
      window.setTimeout(updatePreview, 0);
    }
  }, [
    canEdit,
    drawingId,
    enqueueSceneSave,
    flushBroadcastChanges,
    hasUnsavedChanges,
    isSavingOnLeave,
    navigate,
    refs,
    resolveSafeSnapshot,
    setIsSavingOnLeave,
  ]);

  const handleExportClick = useCallback(async () => {
    if (!refs.excalidrawAPI.current || !drawingId) return;
    const elements =
      refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
    const appState = refs.excalidrawAPI.current.getAppState();
    const files = refs.excalidrawAPI.current.getFiles() || {};
    try {
      await exportFromEditor(drawingId, drawingName, elements, appState, files);
      toast.success("Drawing exported");
    } catch (error) {
      console.error("Failed to export drawing", error);
      toast.error("Failed to bundle drawing images. Please try again.");
    }
  }, [drawingId, drawingName, refs]);

  const handleToggleAutoHide = useCallback(() => {
    setAutoHideEnabled(!autoHideEnabled);
    setIsHeaderVisible(true);
  }, [autoHideEnabled, setAutoHideEnabled, setIsHeaderVisible]);

  const handleRenameStart = useCallback(() => {
    if (!canEdit) return;
    setNewName(drawingName);
    setIsRenaming(true);
  }, [canEdit, drawingName, setIsRenaming, setNewName]);

  return {
    handleBackClick,
    handleBackIntent,
    handleExportClick,
    handleRenameStart,
    handleRenameSubmit,
    handleToggleAutoHide,
  };
};
