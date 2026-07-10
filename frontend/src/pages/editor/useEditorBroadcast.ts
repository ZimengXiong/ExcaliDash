import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { applyUploadedFileRefs, getFilesDelta } from "./shared";
import type { UploadedFileRefs } from "./shared";

type UseEditorBroadcastParams = {
  drawingId: string | undefined;
  excalidrawAPI: MutableRefObject<any>;
  lastLocalChangeAtRef: MutableRefObject<number>;
  lastSyncedElementOrderSigRef: MutableRefObject<string>;
  lastSyncedFilesRef: MutableRefObject<Record<string, any>>;
  latestAppStateRef: MutableRefObject<any>;
  latestFilesRef: MutableRefObject<any>;
  socketMeRef: MutableRefObject<{ id: string }>;
  socketRef: MutableRefObject<any>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
  debouncedSave: (
    drawingId: string,
    elements: readonly any[],
    appState: any,
    files?: Record<string, any>,
  ) => void;
  debouncedSavePreview: (drawingId: string) => void;
  computeElementOrderSig: (elements: readonly any[]) => string;
  hasElementChanged: (element: any) => boolean;
  normalizeImageElementStatus: (
    elements?: readonly any[],
    files?: Record<string, any> | null,
  ) => readonly any[];
  recordElementVersion: (element: any) => void;
  setHasSceneChangesSinceLoad: () => void;
};

export const useEditorBroadcast = ({
  drawingId,
  excalidrawAPI,
  lastLocalChangeAtRef,
  lastSyncedElementOrderSigRef,
  lastSyncedFilesRef,
  latestAppStateRef,
  latestFilesRef,
  socketMeRef,
  socketRef,
  uploadedRefs,
  debouncedSave,
  debouncedSavePreview,
  computeElementOrderSig,
  hasElementChanged,
  normalizeImageElementStatus,
  recordElementVersion,
  setHasSceneChangesSinceLoad,
}: UseEditorBroadcastParams) => {
  const timeoutRef = useRef<number | null>(null);
  const lastRunAtRef = useRef(0);
  const trailingArgsRef = useRef<
    [readonly any[], Record<string, any> | undefined] | null
  >(null);

  const emitChanges = useCallback(
    (elements: readonly any[], currentFiles?: Record<string, any>) => {
      if (!socketRef.current || !drawingId) return;
      const changes: any[] = [];
      const nextFiles = currentFiles || excalidrawAPI.current?.getFiles() || {};
      const normalizedElements = normalizeImageElementStatus(
        elements,
        nextFiles,
      );
      const nextOrderSig = computeElementOrderSig(normalizedElements);
      const shouldSyncOrder =
        nextOrderSig !== lastSyncedElementOrderSigRef.current;
      if (shouldSyncOrder) {
        lastSyncedElementOrderSigRef.current = nextOrderSig;
      }
      normalizedElements.forEach((el) => {
        if (hasElementChanged(el)) {
          changes.push(el);
          recordElementVersion(el);
        }
      });
      const filesDelta = getFilesDelta(lastSyncedFilesRef.current, nextFiles);
      const shouldSyncFiles = Object.keys(filesDelta).length > 0;
      if (Object.keys(nextFiles || {}).length > 0) {
        latestFilesRef.current = nextFiles;
      }
      if (shouldSyncFiles) {
        lastSyncedFilesRef.current = nextFiles;
      }
      if (changes.length > 0 || shouldSyncFiles || shouldSyncOrder) {
        setHasSceneChangesSinceLoad();
        lastLocalChangeAtRef.current = new Date().getTime();
        // Peers receive refs for any uploaded image (KB, not MB over the
        // socket); their rehydrate path already fetches `/api/files/...` refs.
        socketRef.current.emit("element-update", {
          drawingId,
          elements: changes.length > 0 ? changes : [],
          files: shouldSyncFiles
            ? applyUploadedFileRefs(filesDelta, uploadedRefs.current)
            : undefined,
          elementOrder: shouldSyncOrder
            ? normalizedElements.map((el: any) => el?.id).filter(Boolean)
            : undefined,
          userId: socketMeRef.current.id,
        });
        const appState = latestAppStateRef.current;
        if (appState) {
          debouncedSave(drawingId, normalizedElements, appState, nextFiles);
          debouncedSavePreview(drawingId);
        }
      }
    },
    [
      computeElementOrderSig,
      debouncedSave,
      debouncedSavePreview,
      drawingId,
      excalidrawAPI,
      hasElementChanged,
      lastLocalChangeAtRef,
      lastSyncedElementOrderSigRef,
      lastSyncedFilesRef,
      latestAppStateRef,
      latestFilesRef,
      normalizeImageElementStatus,
      recordElementVersion,
      setHasSceneChangesSinceLoad,
      socketRef,
      socketMeRef,
      uploadedRefs,
    ],
  );

  const broadcastChanges = useCallback(
    (elements: readonly any[], currentFiles?: Record<string, any>) => {
      const now = new Date().getTime();
      const elapsed = now - lastRunAtRef.current;

      if (elapsed >= 100) {
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          trailingArgsRef.current = null;
        }
        lastRunAtRef.current = now;
        emitChanges(elements, currentFiles);
        return;
      }

      trailingArgsRef.current = [elements, currentFiles];
      if (timeoutRef.current) return;

      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        const args = trailingArgsRef.current;
        trailingArgsRef.current = null;
        if (!args) return;
        lastRunAtRef.current = new Date().getTime();
        emitChanges(...args);
      }, 100 - elapsed);
    },
    [emitChanges],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  return broadcastChanges;
};
