import { useCallback, useLayoutEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { AppState } from "@excalidraw/excalidraw/types";
import { applyUploadedFileRefs, getFilesDelta } from "./shared";
import type { UploadedFileRefs } from "./shared";

type UseEditorSceneApiParams = {
  canEdit: boolean;
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
  markSceneChanged: () => void;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
  scanFileUploads: () => void;
  setIsReady: (ready: boolean) => void;
};

/**
 * Owns the Excalidraw imperative-API registration and the direct file-delta
 * socket emit. Extracted from Editor to keep that component lean; behavior is
 * unchanged. The `addFiles` monkeypatch broadcasts new files (as refs when
 * already uploaded), schedules a save, and kicks off the per-file upload scan.
 */
export const useEditorSceneApi = ({
  canEdit,
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
  markSceneChanged,
  uploadedRefs,
  scanFileUploads,
  setIsReady,
}: UseEditorSceneApiParams) => {
  const patchedAddFilesApisRef = useRef<WeakSet<object>>(new WeakSet());
  const canEditRef = useRef(canEdit);
  useLayoutEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  const emitFilesDeltaIfNeeded = useCallback(
    (nextFiles: Record<string, any>) => {
      if (!canEditRef.current || !drawingId) return false;
      const filesDelta = getFilesDelta(
        lastSyncedFilesRef.current,
        nextFiles || {},
      );
      if (Object.keys(filesDelta).length === 0) return false;
      latestFilesRef.current = nextFiles;
      lastSyncedFilesRef.current = nextFiles;
      socketRef.current?.emit("element-update", {
        drawingId,
        elements: [],
        files: applyUploadedFileRefs(filesDelta, uploadedRefs.current),
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

  const fittedApisRef = useRef(new WeakSet<object>());

  const fitInitialScene = useCallback(
    ({
      isLoading,
      width,
      height,
    }: Pick<AppState, "isLoading" | "width" | "height">) => {
      const api = excalidrawAPIRef.current;
      if (
        !api ||
        fittedApisRef.current.has(api) ||
        isLoading ||
        !(width > 0 && height > 0)
      ) {
        return;
      }

      fittedApisRef.current.add(api);
      if (new URLSearchParams(window.location.search).has("element")) return;

      const elements = api.getSceneElements?.();
      if (elements?.length) {
        api.scrollToContent?.(elements, {
          fitToViewport: true,
          viewportZoomFactor: 0.9,
          maxZoom: 1,
        });
      }
    },
    [excalidrawAPIRef],
  );

  const setExcalidrawAPI = useCallback(
    (api: any) => {
      excalidrawAPIRef.current = api;
      if (import.meta.env.DEV) {
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
          if (!canEditRef.current || isSyncing.current) return;
          const nextFiles = api.getFiles?.() || {};
          const didEmit = emitFilesDeltaIfNeeded(nextFiles);
          if (
            didEmit &&
            drawingId &&
            latestAppStateRef.current &&
            debouncedSaveRef.current
          ) {
            markSceneChanged();
            debouncedSaveRef.current(
              drawingId,
              latestElementsRef.current,
              latestAppStateRef.current,
              latestFilesRef.current || {},
            );
          }
          // Upload any freshly inserted image right away so the debounced save
          // 1s later can ship a ref instead of inline bytes.
          void scanFileUploads();
        };
      }
      setIsReady(true);
    },
    [
      debouncedSaveRef,
      drawingId,
      emitFilesDeltaIfNeeded,
      excalidrawAPIRef,
      markSceneChanged,
      isSyncing,
      latestAppStateRef,
      latestElementsRef,
      latestFilesRef,
      scanFileUploads,
      setIsReady,
    ],
  );

  return { emitFilesDeltaIfNeeded, fitInitialScene, setExcalidrawAPI };
};
