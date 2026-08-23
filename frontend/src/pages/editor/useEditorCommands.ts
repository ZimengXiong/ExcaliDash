import { useCallback, useEffect } from "react";
import type { FormEvent, MutableRefObject } from "react";
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

type EditorCommandRefs = {
  currentDrawingVersion: MutableRefObject<number | null>;
  excalidrawAPI: MutableRefObject<any>;
  hasSceneChangesSinceLoad: MutableRefObject<boolean>;
  latestFiles: MutableRefObject<any>;
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
      ) => Promise<void>)
    | null
  >;
  suspiciousBlankLoad: MutableRefObject<boolean>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
};

type UseEditorCommandsParams = {
  autoHideEnabled: boolean;
  canEdit: boolean;
  debouncedSaveLibrary: (items: any[]) => void;
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
    options?: { suppressErrors?: boolean },
  ) => Promise<void>;
  setAutoHideEnabled: (enabled: boolean) => void;
  setDrawingName: (name: string) => void;
  setIsHeaderVisible: (visible: boolean) => void;
  setIsRenaming: (isRenaming: boolean) => void;
  setIsSavingOnLeave: (isSaving: boolean) => void;
  setNewName: (name: string) => void;
  user: unknown;
};

export const useEditorCommands = ({
  autoHideEnabled,
  canEdit,
  debouncedSaveLibrary,
  drawingId,
  drawingName,
  enqueueSceneSave,
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
  user,
}: UseEditorCommandsParams) => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!canEdit) return;
        if (
          !(
            refs.excalidrawAPI.current &&
            refs.saveData.current &&
            refs.savePreview.current
          )
        ) {
          return;
        }
        if (!drawingId) return;
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
          refs.savePreview.current(drawingId, safeElements, appState, files);
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
  }, [canEdit, drawingId, enqueueSceneSave, refs, resolveSafeSnapshot]);

  useEffect(() => {
    // Flush the latest scene when the tab is being hidden/closed. Debounced
    // autosave may have pending edits that would otherwise be lost; a
    // keepalive PUT survives the unload where the normal save pipeline can't.
    const handlePageHide = () => {
      if (!canEdit || !drawingId) return;
      const editor = refs.excalidrawAPI.current;
      if (!editor) return;
      if (!refs.hasSceneChangesSinceLoad.current) return;
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
  }, [canEdit, drawingId, refs, resolveSafeSnapshot]);

  const handleRenameSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canEdit || !drawingId) return;
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
    },
    [
      canEdit,
      drawingId,
      drawingName,
      newName,
      setDrawingName,
      setIsRenaming,
      setNewName,
    ],
  );

  const handleLibraryChange = useCallback(
    (items: readonly any[]) => {
      if (!canEdit || !user) return;
      debouncedSaveLibrary([...items]);
    },
    [canEdit, debouncedSaveLibrary, user],
  );

  const handleBackClick = useCallback(async () => {
    if (isSavingOnLeave) return;
    setIsSavingOnLeave(true);
    let shouldNavigate = false;
    try {
      if (
        !(
          refs.excalidrawAPI.current &&
          refs.saveData.current &&
          refs.savePreview.current
        )
      ) {
        shouldNavigate = true;
      } else if (!canEdit || !refs.hasSceneChangesSinceLoad.current) {
        shouldNavigate = true;
      } else if (!drawingId) {
        shouldNavigate = true;
      } else {
        const elements =
          refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
        const { snapshot: safeElements } = resolveSafeSnapshot(elements);
        const appState = refs.excalidrawAPI.current.getAppState();
        const files = refs.excalidrawAPI.current.getFiles() || {};
        refs.latestFiles.current = files;
        if (
          refs.suspiciousBlankLoad.current &&
          !hasRenderableElements(safeElements)
        ) {
          toast.warning(
            "Blank scene detected on load. Skipping save to protect existing data.",
          );
          shouldNavigate = true;
        } else {
          await Promise.all([
            enqueueSceneSave(drawingId, safeElements, appState, files, {
              suppressErrors: false,
            }),
            refs.savePreview.current(drawingId, safeElements, appState, files),
          ]);
          shouldNavigate = true;
        }
      }
    } catch (err) {
      console.error("Failed to save on back navigation", err);
      toast.error("Failed to save changes. Please retry before leaving.");
    } finally {
      setIsSavingOnLeave(false);
    }
    if (shouldNavigate) navigate("/");
  }, [
    canEdit,
    drawingId,
    enqueueSceneSave,
    isSavingOnLeave,
    navigate,
    refs,
    resolveSafeSnapshot,
    setIsSavingOnLeave,
  ]);

  const handleExportClick = useCallback(() => {
    if (!refs.excalidrawAPI.current) return;
    const elements =
      refs.excalidrawAPI.current.getSceneElementsIncludingDeleted();
    const appState = refs.excalidrawAPI.current.getAppState();
    const files = refs.excalidrawAPI.current.getFiles() || {};
    exportFromEditor(drawingName, elements, appState, files);
    toast.success("Drawing exported");
  }, [drawingName, refs]);

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
    handleExportClick,
    handleLibraryChange,
    handleRenameStart,
    handleRenameSubmit,
    handleToggleAutoHide,
  };
};
