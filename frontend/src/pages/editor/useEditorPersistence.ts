import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MutableRefObject } from "react";
import { exportToCanvas, exportToSvg } from "@excalidraw/excalidraw";
import debounce from "lodash/debounce";
import { toast } from "sonner";
import * as api from "../../api";
import { invalidateDrawingPreview } from "../../components/drawing-card/previewCache";
import { saveLibraryItems } from "./librarySync";
import { getAuthSessionGeneration } from "../../utils/authSession";
import { reloadAndReconcile } from "./reconcileSave";
import { compressExcalidrawFiles } from "../../utils/imageCompression";
import { isDefaultPreviewBackground } from "../../utils/previewSvg";
import { renderPreviewSvg } from "../../utils/renderPreview";
import {
  applyUploadedFileRefs,
  getFilesDelta,
  getPersistedAppState,
  hasRenderableElements,
  haveSameElements,
} from "./shared";
import type { UploadedFileRefs } from "./shared";

class DrawingSaveConflictError extends Error {
  constructor(message = "Drawing version conflict") {
    super(message);
    this.name = "DrawingSaveConflictError";
  }
}

// The server refused the save because edit access is gone. `readOnly` means
// the drawing is still viewable and the editor switched to read-only.
export class DrawingAccessLostError extends Error {
  readonly readOnly: boolean;
  constructor(readOnly: boolean) {
    super(readOnly ? "Drawing is read-only" : "Drawing is unavailable");
    this.name = "DrawingAccessLostError";
    this.readOnly = readOnly;
  }
}

// After a 403/404 save, find out whether the drawing is still readable.
const getRemainingAccess = async (
  drawingId: string,
): Promise<"view" | "edit" | "gone" | null> => {
  try {
    const drawing = await api.getDrawing(drawingId, { omitPreview: true });
    return drawing.accessLevel === "view" ? "view" : "edit";
  } catch (err) {
    const status = api.isAxiosError(err) ? err.response?.status : undefined;
    return status === 403 || status === 404 ? "gone" : null;
  }
};

export type SavePreviewOptions = {
  expectedVersion?: number | null;
  useSuppliedSnapshot?: boolean;
};

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
  localSceneRevision: MutableRefObject<number>;
  savedSceneRevision: MutableRefObject<number>;
  lastPersistedElements: MutableRefObject<readonly any[]>;
  lastPersistedFiles: MutableRefObject<Record<string, any>>;
  lastSyncedFiles: MutableRefObject<Record<string, any>>;
  latestAppState: MutableRefObject<any>;
  latestElements: MutableRefObject<readonly any[]>;
  latestFiles: MutableRefObject<any>;
  saveQueue: MutableRefObject<Promise<void>>;
  suspiciousBlankLoad: MutableRefObject<boolean>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
  // Lets the server leave this editor out of its own persisted broadcast.
  socket?: MutableRefObject<{ id?: string } | null>;
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
  // Switch the editor to read-only after edit access was removed.
  onReadOnly?: () => void;
};

export const useEditorPersistence = ({
  drawingId: activeDrawingId,
  canEdit,
  refs,
  user,
  normalizeImageElementStatus,
  resolveSafeSnapshot,
  onReadOnly,
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
        options?: SavePreviewOptions,
      ) => Promise<void>)
    | null
  >(null);
  const saveLibraryRef = useRef<
    ((items: any[], sessionGeneration: number) => Promise<void>) | null
  >(null);
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
      const revision = refs.localSceneRevision.current;
      const persistableAppState = getPersistedAppState(
        editor?.getAppState?.() ?? refs.latestAppState.current ?? appState,
      );
      // Queued arguments may predate a previous conflict merge. Sample the live
      // scene when the queued save starts, including its deletion tombstones.
      const liveElements = editor?.getSceneElementsIncludingDeleted?.();
      // Pair the sampled scene with the version it is based on. A peer's
      // saved-scene broadcast may advance the tracked version meanwhile.
      const sampledVersion = refs.currentDrawingVersion.current;
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
      const editorFilesBeforeCompression = {
        ...files,
        ...refs.latestFiles.current,
        ...editor?.getFiles?.(),
      };
      const compressedFilesResult = await compressExcalidrawFiles(
        editorFilesBeforeCompression,
      );
      if (!canEditRef.current || !isCurrent()) return;
      const persistableFiles = compressedFilesResult.files;
      if (compressedFilesResult.changed) {
        const editorFiles = editor?.getFiles?.() || {};
        const latestFiles = { ...refs.latestFiles.current };
        const missingFiles = [];
        for (const id of compressedFilesResult.changedIds) {
          if (
            editorFiles[id] &&
            editorFiles[id] !== editorFilesBeforeCompression[id]
          )
            continue;
          latestFiles[id] = persistableFiles[id];
          if (!editorFiles[id]) missingFiles.push(persistableFiles[id]);
        }
        // Excalidraw retains bytes for existing IDs. Only add missing files,
        // since resubmitting the whole batch causes another canvas update.
        if (missingFiles.length > 0 && typeof editor?.addFiles === "function") {
          refs.isSyncing.current = true;
          try {
            editor.addFiles(missingFiles);
          } finally {
            refs.isSyncing.current = false;
          }
        }
        refs.latestFiles.current = latestFiles;
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
      const normalizedElementsForSave = normalizeImageElementStatus(
        persistableElements,
        filesToPersist,
      );
      const persistScene = async (
        attempt: number,
        elementsToSave: readonly any[],
        filesToSave: Record<string, any>,
        appStateToSave: Record<string, any>,
        sendFiles: boolean,
        baseVersion: number | null,
      ): Promise<void> => {
        if (!canEditRef.current || !isCurrent()) return;
        try {
          const socketId = refs.socket?.current?.id;
          const updated = await api.saveDrawing(
            drawingId,
            {
              elements: Array.from(elementsToSave),
              appState: appStateToSave,
              ...(sendFiles ? { files: filesToSave } : {}),
              version: baseVersion ?? undefined,
            },
            ...(socketId ? [{ socketId }] : []),
          );
          if (!canEditRef.current || !isCurrent()) return;
          if (typeof updated.version === "number") {
            refs.currentDrawingVersion.current = Math.max(
              refs.currentDrawingVersion.current ?? 0,
              updated.version,
            );
          }
          refs.lastPersistedElements.current = elementsToSave;
          refs.savedSceneRevision.current = revision;
          if (sendFiles) {
            refs.lastPersistedFiles.current = filesToSave;
          }
        } catch (err) {
          if (!isCurrent()) return;
          if (api.isAxiosError(err) && err.response?.status === 409) {
            if (attempt < 4) {
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
              const reconciledAppState = getPersistedAppState(
                reconciled.appState,
              );
              await persistScene(
                attempt + 1,
                reconciled.elements,
                reconciled.files,
                reconciledAppState,
                true,
                refs.currentDrawingVersion.current,
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
        persistableAppState,
        filesChangedSincePersist,
        sampledVersion,
      );
    } catch (err) {
      if (err instanceof DrawingSaveConflictError) {
        toast.error("Drawing changed in another tab. Refresh to load latest.");
        throw err;
      }
      const status = api.isAxiosError(err) ? err.response?.status : undefined;
      if ((status === 403 || status === 404) && isCurrent()) {
        const access = await getRemainingAccess(drawingId);
        if (access === "view") {
          if (isCurrent() && canEditRef.current) {
            canEditRef.current = false;
            onReadOnly?.();
            toast.info("Your access changed to view only.");
          }
          throw new DrawingAccessLostError(true);
        }
        if (access === "gone" || (access === null && status === 404)) {
          toast.error(
            status === 404
              ? "This drawing no longer exists. Changes can't be saved."
              : "You no longer have access to this drawing.",
          );
          throw new DrawingAccessLostError(false);
        }
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
      options?: { suppressErrors?: boolean; onlyIfDirty?: boolean },
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
          if (
            options?.onlyIfDirty &&
            refs.localSceneRevision.current === refs.savedSceneRevision.current
          )
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
    options?: SavePreviewOptions,
  ) => {
    if (!canEditRef.current || !drawingId || historyRestorePendingRef.current)
      return;
    const session = drawingSessionRef.current;
    if (session.drawingId !== undefined && session.drawingId !== drawingId)
      return;
    try {
      const snapshotFromArgs = Array.isArray(elements) ? elements : [];
      const snapshotFromRef = refs.latestElements.current ?? [];
      const candidateSnapshot = options?.useSuppliedSnapshot
        ? snapshotFromArgs
        : hasRenderableElements(snapshotFromArgs) ||
            !hasRenderableElements(snapshotFromRef)
          ? snapshotFromArgs
          : snapshotFromRef;
      const {
        snapshot: currentSnapshot,
        prevented: preventedPreviewOverwrite,
      } = options?.useSuppliedSnapshot
        ? { snapshot: candidateSnapshot, prevented: false }
        : resolveSafeSnapshot(candidateSnapshot);
      const currentFiles = options?.useSuppliedSnapshot
        ? (files ?? {})
        : (refs.latestFiles.current ?? files);
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
      const preview = await renderPreviewSvg(
        { exportToSvg, exportToCanvas },
        {
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
        },
      );
      if (
        !canEditRef.current ||
        historyRestorePendingRef.current ||
        drawingSessionRef.current !== session
      )
        return;
      // A delayed render (e.g. after Back) carries the version it depicts, so
      // the server can skip it once a newer edit has been saved.
      const expectedVersion = options?.expectedVersion;
      await api.saveDrawing(drawingId, {
        preview,
        ...(typeof expectedVersion === "number" ? { expectedVersion } : {}),
      });
      invalidateDrawingPreview(drawingId);
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

  saveLibraryRef.current = async (items: any[], sessionGeneration: number) => {
    if (!user || sessionGeneration !== getAuthSessionGeneration()) return;
    try {
      await saveLibraryItems(items, sessionGeneration);
    } catch (err) {
      console.error("Failed to save library", err);
      if (api.isAxiosError(err) && err.response?.status === 401) return;
      toast.error("Failed to save library");
    }
  };

  const debouncedSave = useMemo(
    () =>
      debounce((drawingId, elements, appState, files) => {
        enqueueSceneSave(drawingId, elements, appState, files, {
          onlyIfDirty: true,
        });
      }, 1000),
    [enqueueSceneSave],
  );
  refs.debouncedSave.current = debouncedSave;

  const debouncedSavePreview = useMemo(
    () =>
      debounce((drawingId: string) => {
        if (!savePreviewRef.current || !drawingId) return;
        if (refs.isUnmounting.current || refs.isSyncing.current) return;
        const expectedRevision = refs.localSceneRevision.current;
        const run = () => {
          if (!savePreviewRef.current) return;
          if (refs.isUnmounting.current || refs.isSyncing.current) return;
          if (refs.localSceneRevision.current !== expectedRevision) return;
          const appState = refs.latestAppState.current;
          if (!appState) return;
          // Skip the thumbnail if another editor commits a newer version first.
          void savePreviewRef.current(
            drawingId,
            refs.latestElements.current,
            appState,
            refs.latestFiles.current || {},
            { expectedVersion: refs.currentDrawingVersion.current },
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

  // Each queued library write carries the auth session it was made in; it is
  // dropped (not flushed) if the account changed before it runs.
  const debouncedSaveLibraryInner = useMemo(
    () =>
      debounce((items: any[], sessionGeneration: number) => {
        if (sessionGeneration !== getAuthSessionGeneration()) return;
        if (saveLibraryRef.current)
          void saveLibraryRef.current(items, sessionGeneration);
      }, 1000),
    [],
  );
  const debouncedSaveLibrary = useMemo(() => {
    const queue = (items: any[]) =>
      debouncedSaveLibraryInner(items, getAuthSessionGeneration());
    queue.flush = () => debouncedSaveLibraryInner.flush();
    queue.cancel = () => debouncedSaveLibraryInner.cancel();
    return queue;
  }, [debouncedSaveLibraryInner]);

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
    async (
      drawingId: string,
      restore: () => Promise<unknown>,
      flushPendingChanges?: () => void,
    ) => {
      if (historyRestorePendingRef.current) return;
      const editor = refs.excalidrawAPI.current;
      if (!editor) throw new Error("Drawing is still loading");
      // Emit edits still waiting in the broadcast throttle so they count as
      // unsaved, then drop the debounce: this backup save replaces it.
      flushPendingChanges?.();
      debouncedSave.cancel();
      const liveElements = editor.getSceneElementsIncludingDeleted();
      // Skip the backup save only when the canvas matches the last saved
      // revision and scene; otherwise it would add a duplicate version.
      const liveMatchesSaved = haveSameElements(
        liveElements,
        refs.lastPersistedElements.current,
      );
      const finalLiveSave = enqueueSceneSave(
        drawingId,
        liveElements,
        editor.getAppState(),
        editor.getFiles() || {},
        { suppressErrors: false, onlyIfDirty: liveMatchesSaved },
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
