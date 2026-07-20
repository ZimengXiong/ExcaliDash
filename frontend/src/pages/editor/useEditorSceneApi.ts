import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import { getAdmittedFileRefs, getFilesDelta } from "./shared";
import type { UploadedFileRefs } from "./shared";

type UseEditorSceneApiParams = {
  drawingId: string | undefined;
  excalidrawAPIRef: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  socketRef: MutableRefObject<any>;
  socketMeRef: MutableRefObject<{ id: string }>;
  lastSyncedFilesRef: MutableRefObject<Record<string, any>>;
  latestFilesRef: MutableRefObject<any>;
  latestElementsRef: MutableRefObject<readonly any[]>;
  latestAppStateRef: MutableRefObject<any>;
  debouncedSaveRef: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => void)
    | null
  >;
  hasSceneChangesSinceLoadRef: MutableRefObject<boolean>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
  scanFileUploads: () => Promise<void>;
  setIsReady: (ready: boolean) => void;
};

/**
 * Owns the Excalidraw imperative-API registration and the direct file-delta
 * socket emit. Extracted from Editor to keep that component lean; behavior is
 * unchanged. The `addFiles` monkeypatch broadcasts new files (as refs when
 * already uploaded), schedules a save, and kicks off the per-file upload scan.
 */
export const useEditorSceneApi = ({
  drawingId,
  excalidrawAPIRef,
  isSyncing,
  socketRef,
  socketMeRef,
  lastSyncedFilesRef,
  latestFilesRef,
  latestElementsRef,
  latestAppStateRef,
  debouncedSaveRef,
  hasSceneChangesSinceLoadRef,
  uploadedRefs,
  scanFileUploads,
  setIsReady,
}: UseEditorSceneApiParams) => {
  const patchedAddFilesApisRef = useRef<WeakSet<object>>(new WeakSet());

  const emitFilesDeltaIfNeeded = useCallback(
    (nextFiles: Record<string, any>) => {
      if (!socketRef.current || !drawingId) return false;
      latestFilesRef.current = nextFiles;
      const admittedFiles = getAdmittedFileRefs(nextFiles, uploadedRefs.current);
      const filesDelta = getFilesDelta(
        lastSyncedFilesRef.current,
        admittedFiles,
      );
      if (Object.keys(filesDelta).length === 0) return false;
      lastSyncedFilesRef.current = admittedFiles;
      socketRef.current.emit("element-update", {
        drawingId,
        elements: [],
        files: filesDelta,
        userId: socketMeRef.current.id,
      });
      return true;
    },
    [
      drawingId,
      lastSyncedFilesRef,
      latestFilesRef,
      socketMeRef,
      socketRef,
      uploadedRefs,
    ],
  );

  const setExcalidrawAPI = useCallback(
    (api: any) => {
      excalidrawAPIRef.current = api;
      if (
        import.meta.env.DEV ||
        import.meta.env.VITE_EXPOSE_E2E_TEST_API === "true"
      ) {
        (window as any).__EXCALIDASH_EXCALIDRAW_API__ = api;
      }
      if (
        api &&
        typeof api.addFiles === "function" &&
        !patchedAddFilesApisRef.current.has(api as object)
      ) {
        patchedAddFilesApisRef.current.add(api as object);
        const originalAddFiles = api.addFiles.bind(api);
        api.addFiles = (filesInput: Record<string, any> | any[]) => {
          const normalizedFiles = Array.isArray(filesInput)
            ? filesInput
            : Object.values(filesInput || {});
          originalAddFiles(normalizedFiles);
          if (isSyncing.current) return;
          // Upload before publishing or persisting the image. It remains visible
          // locally while pending, but inline bytes never enter socket/scene data.
          void scanFileUploads().then(() => {
            const nextFiles = api.getFiles?.() || {};
            const didEmit = emitFilesDeltaIfNeeded(nextFiles);
            if (
              didEmit &&
              drawingId &&
              latestAppStateRef.current &&
              debouncedSaveRef.current
            ) {
              hasSceneChangesSinceLoadRef.current = true;
              debouncedSaveRef.current(
                drawingId,
                latestElementsRef.current,
                latestAppStateRef.current,
                latestFilesRef.current || {},
              );
            }
          });
        };
      }
      setIsReady(true);
    },
    [
      debouncedSaveRef,
      drawingId,
      emitFilesDeltaIfNeeded,
      excalidrawAPIRef,
      hasSceneChangesSinceLoadRef,
      isSyncing,
      latestAppStateRef,
      latestElementsRef,
      latestFilesRef,
      scanFileUploads,
      setIsReady,
    ],
  );

  return { emitFilesDeltaIfNeeded, setExcalidrawAPI };
};
