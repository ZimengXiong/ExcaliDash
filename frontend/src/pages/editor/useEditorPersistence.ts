import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MutableRefObject } from "react";
import { exportToSvg } from "@excalidraw/excalidraw";
import debounce from "lodash/debounce";
import { toast } from "sonner";
import * as api from "../../api";
import { reloadAndReconcile } from "./reconcileSave";
import { compressExcalidrawFiles } from "../../utils/imageCompression";
import { isDefaultPreviewBackground } from "../../utils/previewSvg";
import {
  applyUploadedFileRefs,
  getFilesDelta,
  getPersistedAppState,
  hasRenderableElements,
} from "./shared";
import type { UploadedFileRefs } from "./shared";

class DrawingSaveConflictError extends Error {
  constructor(message = "Drawing version conflict") {
    super(message);
    this.name = "DrawingSaveConflictError";
  }
}

type PersistenceRefs = {
  currentDrawingVersion: MutableRefObject<number | null>;
  debouncedSave: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => void)
    | null
  >;
  excalidrawAPI: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  isUnmounting: MutableRefObject<boolean>;
  lastLocalChangeAt: MutableRefObject<number>;
  lastPersistedElements: MutableRefObject<readonly any[]>;
  lastPersistedFiles: MutableRefObject<Record<string, any>>;
  lastSyncedFiles: MutableRefObject<Record<string, any>>;
  latestAppState: MutableRefObject<any>;
  latestElements: MutableRefObject<readonly any[]>;
  latestFiles: MutableRefObject<any>;
  saveQueue: MutableRefObject<Promise<void>>;
  suspiciousBlankLoad: MutableRefObject<boolean>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
};

type UseEditorPersistenceParams = {
  drawingId?: string;
  canEdit: boolean;
  refs: PersistenceRefs;
  user: unknown;
  normalizeImageElementStatus: (
    elements?: readonly any[],
    files?: Record<string, any> | null,
  ) => readonly any[];
  resolveSafeSnapshot: (candidateSnapshot?: readonly any[]) => {
    snapshot: readonly any[];
    prevented: boolean;
    staleEmptySnapshot: boolean;
    staleNonRenderableSnapshot: boolean;
  };
};

export const useEditorPersistence = ({
  drawingId: activeDrawingId,
  canEdit,
  refs,
  user,
  normalizeImageElementStatus,
  resolveSafeSnapshot,
}: UseEditorPersistenceParams) => {
  const historyRestorePendingRef = useRef(false);
  const drawingSessionRef = useRef({ drawingId: activeDrawingId });
  useLayoutEffect(() => {
    if (drawingSessionRef.current.drawingId !== activeDrawingId) {
      drawingSessionRef.current = { drawingId: activeDrawingId };
      historyRestorePendingRef.current = false;
    }
  }, [activeDrawingId]);
  const pendingPreviewSavesRef = useRef(new Set<Promise<void>>());
  const canEditRef = useRef(canEdit);
  useLayoutEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);
  const saveDataRef = useRef<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => Promise<void>)
    | null
  >(null);
  const savePreviewRef = useRef<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files: any,
      ) => Promise<void>)
    | null
  >(null);
  const saveLibraryRef = useRef<((items: any[]) => Promise<void>) | null>(null);
  const [autosaveFailing, setAutosaveFailing] = useState(false);
  const autosaveFailureCountRef = useRef(0);

  saveDataRef.current = async (
    drawingId: string,
    elements: readonly any[],
    appState: any,
    files?: Record<string, any>,
  ) => {
    const session = drawingSessionRef.current;
    const editor = refs.excalidrawAPI.current;
    const isCurrent = () =>
      drawingSessionRef.current === session &&
      (session.drawingId === undefined || session.drawingId === drawingId) &&
      refs.excalidrawAPI.current === editor;
    if (!canEditRef.current || !drawingId || !isCurrent()) return;
    try {
      const persistableAppState = getPersistedAppState(
        editor?.getAppState?.() ?? refs.latestAppState.current ?? appState,
      );
      // Queued arguments may predate a previous conflict merge. Sample the live
      // scene when the queued save starts, including its deletion tombstones.
      const liveElements = editor?.getSceneElementsIncludingDeleted?.();
      const candidateElements = Array.isArray(liveElements)
        ? liveElements
        : Array.isArray(refs.latestElements.current)
          ? refs.latestElements.current
          : elements;
      const {
        snapshot: safeElements,
        prevented,
        staleEmptySnapshot,
        staleNonRenderableSnapshot,
      } = resolveSafeSnapshot(candidateElements);
      const persistableElements = Array.from(safeElements);
      if (
        refs.suspiciousBlankLoad.current &&
        !hasRenderableElements(persistableElements)
      ) {
        console.warn(
          "[Editor] Blocking non-renderable save due to suspicious blank load",
          { drawingId, elementCount: persistableElements.length },
        );
        return;
      }
      if (staleEmptySnapshot || staleNonRenderableSnapshot) {
        console.warn("[Editor] Skipping stale snapshot save", {
          drawingId,
          candidateElementCount: candidateElements.length,
          fallbackElementCount: persistableElements.length,
          prevented,
          staleEmptySnapshot,
          staleNonRenderableSnapshot,
        });
        return;
      }
      let persistableFiles = {
        ...files,
        ...refs.latestFiles.current,
        ...editor?.getFiles?.(),
      };
      const editorFilesBeforeCompression = persistableFiles;
      const compressedFilesResult =
        await compressExcalidrawFiles(persistableFiles);
      if (!canEditRef.current || !isCurrent()) return;
      if (compressedFilesResult.changed) {
        persistableFiles = compressedFilesResult.files;
        if (
          refs.excalidrawAPI.current &&
          typeof refs.excalidrawAPI.current.addFiles === "function"
        ) {
          refs.isSyncing.current = true;
          try {
            refs.excalidrawAPI.current.addFiles(
              Object.values(persistableFiles),
            );
          } finally {
            refs.isSyncing.current = false;
          }
        }
        refs.latestFiles.current = {
          ...refs.latestFiles.current,
          ...persistableFiles,
        };
        // Excalidraw may retain the original blob when addFiles receives an
        // existing content-derived ID, so compare realtime changes against
        // the file map that is still in the editor.
        refs.lastSyncedFiles.current = editorFilesBeforeCompression;
      }
      // Swap inline bytes for a ref on any file already uploaded out-of-band so
      // the PUT ships KB, not MB. Files not yet uploaded keep their inline
      // dataURL and the server interns them — no data loss on an upload race.
      const filesToPersist = applyUploadedFileRefs(
        persistableFiles,
        refs.uploadedRefs.current,
      );
      const filesChangedSincePersist =
        Object.keys(
          getFilesDelta(
            refs.lastPersistedFiles.current || {},
            filesToPersist || {},
          ),
        ).length > 0;
      const normalizedElementsForSave = Array.from(
        normalizeImageElementStatus(persistableElements, filesToPersist),
      );
      const persistScene = async (
        attempt: number,
        elementsToSave: readonly any[],
        filesToSave: Record<string, any>,
        sendFiles: boolean,
      ): Promise<void> => {
        if (!canEditRef.current || !isCurrent()) return;
        try {
          const updated = await api.updateDrawing(drawingId, {
            elements: Array.from(elementsToSave),
            appState: persistableAppState,
            ...(sendFiles ? { files: filesToSave } : {}),
            version: refs.currentDrawingVersion.current ?? undefined,
          });
          if (!canEditRef.current || !isCurrent()) return;
          if (typeof updated.version === "number") {
            refs.currentDrawingVersion.current = Math.max(
              refs.currentDrawingVersion.current ?? 0,
              updated.version,
            );
          }
          refs.lastPersistedElements.current = elementsToSave;
          if (sendFiles) {
            refs.lastPersistedFiles.current = filesToSave;
          }
        } catch (err) {
          if (!isCurrent()) return;
          if (api.isAxiosError(err) && err.response?.status === 409) {
            if (attempt < 4) {
              // Concurrent editors can collide again after reconciliation.
              // Stagger retries, but always merge against the latest version
              // rather than overwriting another participant's changes.
              await new Promise((resolve) =>
                setTimeout(resolve, 100 * 2 ** attempt + Math.random() * 150),
              );
              const reconciled = await reloadAndReconcile(
                refs,
                drawingId,
                elementsToSave,
                filesToSave,
                isCurrent,
              );
              if (!reconciled) return;
              await persistScene(
                attempt + 1,
                reconciled.elements,
                reconciled.files,
                true,
              );
              return;
            }
            throw new DrawingSaveConflictError();
          }
          throw err;
        }
      };
      await persistScene(
        0,
        normalizedElementsForSave,
        filesToPersist,
        filesChangedSincePersist,
      );
    } catch (err) {
      if (err instanceof DrawingSaveConflictError) {
        toast.error("Drawing changed in another tab. Refresh to load latest.");
        throw err;
      }
      if (api.isAxiosError(err) && err.response?.status === 404) {
        toast.error("This drawing no longer exists. Changes can't be saved.");
        throw err;
      }
      console.error("Failed to save drawing", err);
      toast.error("Failed to save changes");
      throw err;
    }
  };

  const enqueueSceneSave = useCallback(
    (
      drawingId: string,
      elements: readonly any[],
      appState: any,
      files?: Record<string, any>,
      options?: { suppressErrors?: boolean },
    ) => {
      // Restore owns the scene until reload (or failure). Existing saves may
      // drain, but late broadcast/file timers must not enqueue another save.
      if (historyRestorePendingRef.current) return Promise.resolve();
      const suppressErrors = options?.suppressErrors ?? true;
      const session = drawingSessionRef.current;
      refs.saveQueue.current = refs.saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!saveDataRef.current || drawingSessionRef.current !== session)
            return;
          try {
            await saveDataRef.current(drawingId, elements, appState, files);
            // A successful save (autosave or explicit) clears the indicator.
            if (
              drawingSessionRef.current === session &&
              autosaveFailureCountRef.current !== 0
            ) {
              autosaveFailureCountRef.current = 0;
              setAutosaveFailing(false);
            }
          } catch (err) {
            if (suppressErrors) {
              // Best-effort autosave: after repeated failures raise a
              // persistent unsaved-changes indicator instead of silently
              // dropping every error.
              if (drawingSessionRef.current !== session) return;
              autosaveFailureCountRef.current += 1;
              if (autosaveFailureCountRef.current >= 2) {
                setAutosaveFailing(true);
              }
              return;
            }
            throw err;
          }
        });
      return refs.saveQueue.current;
    },
    [refs],
  );

  const savePreview = async (
    drawingId: string,
    elements: readonly any[],
    appState: any,
    files: any,
  ) => {
    if (!canEditRef.current || !drawingId || historyRestorePendingRef.current)
      return;
    const session = drawingSessionRef.current;
    if (session.drawingId !== undefined && session.drawingId !== drawingId)
      return;
    try {
      const snapshotFromArgs = Array.isArray(elements) ? elements : [];
      const snapshotFromRef = refs.latestElements.current ?? [];
      const candidateSnapshot =
        hasRenderableElements(snapshotFromArgs) ||
        !hasRenderableElements(snapshotFromRef)
          ? snapshotFromArgs
          : snapshotFromRef;
      const {
        snapshot: currentSnapshot,
        prevented: preventedPreviewOverwrite,
      } = resolveSafeSnapshot(candidateSnapshot);
      const currentFiles = refs.latestFiles.current ?? files;
      const normalizedSnapshot = normalizeImageElementStatus(
        currentSnapshot,
        currentFiles,
      );
      if (
        refs.suspiciousBlankLoad.current &&
        !hasRenderableElements(currentSnapshot)
      ) {
        return;
      }
      if (preventedPreviewOverwrite) {
        console.warn("[Editor] Prevented stale snapshot preview overwrite", {
          drawingId,
          fallbackElementCount: currentSnapshot.length,
        });
      }
      const svg = await exportToSvg({
        elements: normalizedSnapshot,
        appState: {
          ...appState,
          exportBackground: !isDefaultPreviewBackground(
            appState.viewBackgroundColor,
          ),
          exportWithDarkMode: false,
          viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
        },
        files: currentFiles,
      });
      if (
        !canEditRef.current ||
        historyRestorePendingRef.current ||
        drawingSessionRef.current !== session
      )
        return;
      await api.updateDrawing(drawingId, { preview: svg.outerHTML });
    } catch (err) {
      console.error("Failed to save preview", err);
    }
  };

  savePreviewRef.current = (...args) => {
    const pendingSave = savePreview(...args);
    pendingPreviewSavesRef.current.add(pendingSave);
    void pendingSave.finally(() =>
      pendingPreviewSavesRef.current.delete(pendingSave),
    );
    return pendingSave;
  };

  saveLibraryRef.current = async (items: any[]) => {
    if (!user) return;
    try {
      await api.updateLibrary(items);
    } catch (err) {
      console.error("Failed to save library", err);
      if (api.isAxiosError(err) && err.response?.status === 401) return;
      toast.error("Failed to save library");
    }
  };

  const debouncedSave = useMemo(
    () =>
      debounce((drawingId, elements, appState, files) => {
        enqueueSceneSave(drawingId, elements, appState, files);
      }, 1000),
    [enqueueSceneSave],
  );
  refs.debouncedSave.current = debouncedSave;

  const debouncedSavePreview = useMemo(
    () =>
      debounce((drawingId: string) => {
        if (!savePreviewRef.current || !drawingId) return;
        if (refs.isUnmounting.current || refs.isSyncing.current) return;
        const expectedChangeAt = refs.lastLocalChangeAt.current;
        const run = () => {
          if (!savePreviewRef.current) return;
          if (refs.isUnmounting.current || refs.isSyncing.current) return;
          if (refs.lastLocalChangeAt.current !== expectedChangeAt) return;
          const appState = refs.latestAppState.current;
          if (!appState) return;
          void savePreviewRef.current(
            drawingId,
            refs.latestElements.current,
            appState,
            refs.latestFiles.current || {},
          );
        };
        const w = window as any;
        if (typeof w.requestIdleCallback === "function") {
          w.requestIdleCallback(run, { timeout: 2000 });
        } else {
          setTimeout(run, 0);
        }
      }, 30_000),
    [refs],
  );

  const debouncedSaveLibrary = useMemo(
    () =>
      debounce((items: any[]) => {
        if (saveLibraryRef.current) saveLibraryRef.current(items);
      }, 1000),
    [],
  );

  useEffect(() => {
    return () => {
      // Flush pending scene/library saves on unmount so a fast navigation
      // away doesn't drop the user's last debounced edits. The preview is a
      // regenerable thumbnail, so it is safe to cancel.
      debouncedSave.flush();
      debouncedSaveLibrary.flush();
      debouncedSavePreview.cancel();
    };
  }, [debouncedSave, debouncedSaveLibrary, debouncedSavePreview]);

  const runHistoryRestore = useCallback(
    async (drawingId: string, restore: () => Promise<unknown>) => {
      if (historyRestorePendingRef.current) return;
      // Save the live API snapshot before locking, including edits still waiting
      // in the broadcast throttle. A stale debounce must not replace this backup.
      debouncedSave.cancel();
      const editor = refs.excalidrawAPI.current;
      if (!editor) throw new Error("Drawing is still loading");
      const finalLiveSave = enqueueSceneSave(
        drawingId,
        editor.getSceneElementsIncludingDeleted(),
        editor.getAppState(),
        editor.getFiles() || {},
        { suppressErrors: false },
      );
      historyRestorePendingRef.current = true;
      debouncedSavePreview.cancel();
      try {
        await finalLiveSave;
        await Promise.all(pendingPreviewSavesRef.current);
        await restore();
        // Keep writes blocked through reload, including pagehide/unmount flushes.
      } catch (error) {
        historyRestorePendingRef.current = false;
        throw error;
      }
    },
    [debouncedSave, debouncedSavePreview, enqueueSceneSave, refs],
  );

  return {
    autosaveFailing,
    historyRestorePendingRef,
    runHistoryRestore,
    debouncedSave,
    debouncedSaveLibrary,
    debouncedSavePreview,
    enqueueSceneSave,
    saveDataRef,
    savePreviewRef,
  };
};
