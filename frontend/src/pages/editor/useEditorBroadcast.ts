import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import {
  applyUploadedFileRefs,
  getElementOrder,
  getFilesDelta,
  getImageElementStatus,
} from "./shared";
import type { UploadedFileRefs } from "./shared";

type UseEditorBroadcastParams = {
  drawingId: string | undefined;
  excalidrawAPI: MutableRefObject<any>;
  lastSyncedElementOrderRef: MutableRefObject<readonly string[] | null>;
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
  hasElementChanged: (element: any, status?: unknown) => boolean;
  recordElementVersion: (element: any) => void;
  markSceneChanged: () => void;
};

export const useEditorBroadcast = ({
  drawingId,
  excalidrawAPI,
  lastSyncedElementOrderRef,
  lastSyncedFilesRef,
  latestAppStateRef,
  latestFilesRef,
  socketMeRef,
  socketRef,
  uploadedRefs,
  debouncedSave,
  debouncedSavePreview,
  hasElementChanged,
  recordElementVersion,
  markSceneChanged,
}: UseEditorBroadcastParams) => {
  const timeoutRef = useRef<number | null>(null);
  const lastRunAtRef = useRef(0);
  const trailingArgsRef = useRef<
    [readonly any[], Record<string, any> | undefined] | null
  >(null);

  const emitChanges = useCallback(
    (elements: readonly any[], currentFiles?: Record<string, any>) => {
      if (!drawingId) return;
      const changes: any[] = [];
      const nextFiles = currentFiles || excalidrawAPI.current?.getFiles() || {};
      const previousOrder = lastSyncedElementOrderRef.current;
      let orderChanged = previousOrder === null;
      let orderIndex = 0;
      for (const element of elements) {
        const id = element?.id;
        if (typeof id === "string" && id.length > 0) {
          if (!orderChanged && previousOrder?.[orderIndex] !== id) {
            orderChanged = true;
          }
          orderIndex += 1;
        }
        const status = getImageElementStatus(element, nextFiles);
        if (hasElementChanged(element, status)) {
          const change =
            status === element.status ? element : { ...element, status };
          changes.push(change);
          recordElementVersion(change);
        }
      }
      let elementOrder: string[] | undefined;
      if (orderChanged || previousOrder?.length !== orderIndex) {
        elementOrder = getElementOrder(elements);
        lastSyncedElementOrderRef.current = elementOrder;
      }
      const filesDelta = getFilesDelta(lastSyncedFilesRef.current, nextFiles);
      const shouldSyncFiles = Object.keys(filesDelta).length > 0;
      if (Object.keys(nextFiles || {}).length > 0) {
        latestFilesRef.current = nextFiles;
      }
      if (shouldSyncFiles) {
        lastSyncedFilesRef.current = nextFiles;
      }
      if (changes.length > 0 || shouldSyncFiles || elementOrder) {
        markSceneChanged();
        // Peers receive refs for any uploaded image (KB, not MB over the
        // socket); their rehydrate path already fetches `/api/files/...` refs.
        socketRef.current?.emit("element-update", {
          drawingId,
          elements: changes,
          files: shouldSyncFiles
            ? applyUploadedFileRefs(filesDelta, uploadedRefs.current)
            : undefined,
          elementOrder,
          userId: socketMeRef.current.id,
        });
        const appState = latestAppStateRef.current;
        if (appState) {
          debouncedSave(drawingId, elements, appState, nextFiles);
          debouncedSavePreview(drawingId);
        }
      }
    },
    [
      debouncedSave,
      debouncedSavePreview,
      drawingId,
      excalidrawAPI,
      hasElementChanged,
      lastSyncedElementOrderRef,
      lastSyncedFilesRef,
      latestAppStateRef,
      latestFilesRef,
      recordElementVersion,
      markSceneChanged,
      socketRef,
      socketMeRef,
      uploadedRefs,
    ],
  );

  const flushBroadcastChanges = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const args = trailingArgsRef.current;
    trailingArgsRef.current = null;
    if (!args) return;
    lastRunAtRef.current = Date.now();
    emitChanges(...args);
  }, [emitChanges]);

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

      timeoutRef.current = window.setTimeout(
        flushBroadcastChanges,
        100 - elapsed,
      );
    },
    [emitChanges, flushBroadcastChanges],
  );

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        trailingArgsRef.current = null;
      }
    },
    [drawingId],
  );

  return { broadcastChanges, flushBroadcastChanges };
};
