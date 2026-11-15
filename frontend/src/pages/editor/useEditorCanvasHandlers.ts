import { useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { toast } from "sonner";
import {
  createDroppedId,
  type DroppedImageData,
  type DropViewport,
  fitDroppedImageToViewport,
  getDroppedImageFiles,
  loadDroppedImageData,
  MULTI_IMAGE_DROP_GAP,
} from "./droppedImages";
import {
  hasRenderableElements,
  haveSameElements,
  isStaleNonRenderableSnapshot,
  isSuspiciousEmptySnapshot,
} from "./shared";

// How often we poll the Excalidraw API for late-added files (e.g. pasted images
// that never surface through onChange). Kept well above 1s: compression is now
// memoized, so a tighter interval only burns main-thread cycles for no gain.
const FILES_POLL_INTERVAL_MS = 2500;

type CanvasHandlerRefs = {
  excalidrawAPI: MutableRefObject<any>;
  hasHydratedInitialScene: MutableRefObject<boolean>;
  hasSceneChangesSinceLoad: MutableRefObject<boolean>;
  initialSceneElements: MutableRefObject<readonly any[]>;
  isBootstrappingScene: MutableRefObject<boolean>;
  isSyncing: MutableRefObject<boolean>;
  isUnmounting: MutableRefObject<boolean>;
  lastLocalChangeAt: MutableRefObject<number>;
  latestAppState: MutableRefObject<any>;
  latestElements: MutableRefObject<readonly any[]>;
  latestFiles: MutableRefObject<any>;
  debouncedSave: MutableRefObject<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => void)
    | null
  >;
  suspiciousBlankLoad: MutableRefObject<boolean>;
};

// A file dropped on the canvas, with its size, so the drop handler can lay out
// several files before it adds any of them to the scene.
type DroppedItem = {
  width: number;
  height: number;
  place: (topLeft: { x: number; y: number }) => {
    elements: any[];
    files: any[];
  };
};

const imageItem = (
  image: DroppedImageData,
  viewport: DropViewport,
): DroppedItem => {
  const { width, height } = fitDroppedImageToViewport(image, viewport);
  return {
    width,
    height,
    place: ({ x, y }) => ({
      elements: convertToExcalidrawElements([
        {
          type: "image" as const,
          x,
          y,
          width,
          height,
          fileId: image.fileId as any,
          scale: [1, 1] as [number, number],
          status: "saved" as const,
        },
      ]),
      files: [
        {
          id: image.fileId,
          mimeType: image.mimeType,
          dataURL: image.dataURL,
          created: image.created,
        },
      ],
    }),
  };
};

type UseEditorCanvasHandlersParams = {
  canEdit: boolean;
  debouncedSavePreview: (drawingId: string) => void;
  drawingId: string | undefined;
  emitFilesDeltaIfNeeded: (nextFiles: Record<string, any>) => boolean;
  isReady: boolean;
  refs: CanvasHandlerRefs;
  resolveSafeSnapshot: (candidateSnapshot?: readonly any[]) => {
    prevented: boolean;
    staleEmptySnapshot: boolean;
    staleNonRenderableSnapshot: boolean;
  };
  broadcastChanges: (
    elements: readonly any[],
    currentFiles?: Record<string, any>,
  ) => void;
};

export const useEditorCanvasHandlers = ({
  canEdit,
  debouncedSavePreview,
  drawingId,
  emitFilesDeltaIfNeeded,
  isReady,
  refs,
  resolveSafeSnapshot,
  broadcastChanges,
}: UseEditorCanvasHandlersParams) => {
  const {
    debouncedSave: debouncedSaveRef,
    excalidrawAPI: excalidrawAPIRef,
    hasHydratedInitialScene: hasHydratedInitialSceneRef,
    hasSceneChangesSinceLoad: hasSceneChangesSinceLoadRef,
    initialSceneElements: initialSceneElementsRef,
    isBootstrappingScene: isBootstrappingSceneRef,
    isSyncing: isSyncingRef,
    isUnmounting: isUnmountingRef,
    lastLocalChangeAt: lastLocalChangeAtRef,
    latestAppState: latestAppStateRef,
    latestElements: latestElementsRef,
    latestFiles: latestFilesRef,
    suspiciousBlankLoad: suspiciousBlankLoadRef,
  } = refs;

  const handleCanvasChange = useCallback(
    (elements: readonly any[], appState: any, files?: Record<string, any>) => {
      if (!canEdit) return;
      if (isUnmountingRef.current) return;
      if (isSyncingRef.current) return;
      latestAppStateRef.current = appState;
      const currentFiles = files || excalidrawAPIRef.current?.getFiles() || {};
      if (Object.keys(currentFiles).length > 0) {
        latestFilesRef.current = currentFiles;
      }
      const allElements = excalidrawAPIRef.current
        ? excalidrawAPIRef.current.getSceneElementsIncludingDeleted()
        : elements;
      if (!hasHydratedInitialSceneRef.current) {
        const matchesInitialSnapshot = haveSameElements(
          allElements,
          initialSceneElementsRef.current,
        );
        const transientHydrationEmpty = isSuspiciousEmptySnapshot(
          initialSceneElementsRef.current,
          allElements,
        );
        const transientHydrationNonRenderable = isStaleNonRenderableSnapshot(
          initialSceneElementsRef.current,
          allElements,
        );
        if (transientHydrationEmpty || transientHydrationNonRenderable) return;
        hasHydratedInitialSceneRef.current = true;
        isBootstrappingSceneRef.current = false;
        if (matchesInitialSnapshot) return;
      }
      const { prevented: preventedCanvasOverwrite } =
        resolveSafeSnapshot(allElements);
      if (preventedCanvasOverwrite) return;
      const hasRenderable = hasRenderableElements(allElements);
      if (hasRenderable && suspiciousBlankLoadRef.current) {
        suspiciousBlankLoadRef.current = false;
      }
      if (isBootstrappingSceneRef.current && !hasRenderable) return;
      latestElementsRef.current = allElements;
      broadcastChanges(allElements, currentFiles);
    },
    [
      broadcastChanges,
      canEdit,
      excalidrawAPIRef,
      hasHydratedInitialSceneRef,
      initialSceneElementsRef,
      isBootstrappingSceneRef,
      isSyncingRef,
      isUnmountingRef,
      latestAppStateRef,
      latestElementsRef,
      latestFilesRef,
      resolveSafeSnapshot,
      suspiciousBlankLoadRef,
    ],
  );

  // Stack the dropped items in a column centred on the drop point, with the
  // first item's middle at the drop point, and add them to the scene.
  const insertDroppedItems = useCallback(
    (items: DroppedItem[], dropPoint: { x: number; y: number }) => {
      const api = excalidrawAPIRef.current;
      if (!api || items.length === 0) return;
      const newElements: any[] = [];
      const newFiles: any[] = [];
      let nextY = dropPoint.y - items[0].height / 2;
      for (const item of items) {
        const placed = item.place({
          x: dropPoint.x - item.width / 2,
          y: nextY,
        });
        newElements.push(...placed.elements);
        newFiles.push(...placed.files);
        nextY += item.height + MULTI_IMAGE_DROP_GAP;
      }
      if (newFiles.length > 0) api.addFiles(newFiles);
      // Select a frame without its children, as Excalidraw does.
      // Selecting both moves the children twice when you drag the selection.
      const topLevel = newElements.filter((element) => !element.frameId);
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), ...newElements],
        appState: {
          selectedElementIds: Object.fromEntries(
            topLevel
              .filter((element) => !element.containerId)
              .map((element) => [element.id, true]),
          ),
          // Select each dropped group as a whole, replacing the previous group
          // selection.
          // The outermost group is the last entry in groupIds.
          selectedGroupIds: Object.fromEntries(
            topLevel
              .filter((element) => element.groupIds?.length)
              .map((element) => [element.groupIds.at(-1), true]),
          ),
          editingGroupId: null,
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    [excalidrawAPIRef],
  );

  const handleCanvasDropCapture = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      if (!canEdit || !excalidrawAPIRef.current) return;
      const allDroppedFiles = Array.from(event.dataTransfer?.files || []);
      const droppedImages = getDroppedImageFiles(event.dataTransfer);
      if (
        droppedImages.length <= 1 ||
        droppedImages.length !== allDroppedFiles.length
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const appState = excalidrawAPIRef.current.getAppState?.();
      if (!appState) return;
      try {
        const dropPoint = viewportCoordsToSceneCoords(
          { clientX: event.clientX, clientY: event.clientY },
          appState,
        );
        const loadedImages = await Promise.all(
          droppedImages.map(loadDroppedImageData),
        );
        if (loadedImages.length === 0) return;
        excalidrawAPIRef.current.addFiles(
          loadedImages.map(({ fileId, mimeType, dataURL, created }) => ({
            id: fileId,
            mimeType,
            dataURL,
            created,
          })),
        );
        let nextY = dropPoint.y;
        const imageElements = convertToExcalidrawElements(
          loadedImages.map((image, index) => {
            const y = index === 0 ? dropPoint.y - image.height / 2 : nextY;
            nextY = y + image.height + MULTI_IMAGE_DROP_GAP;
            return {
              type: "image" as const,
              x: dropPoint.x - image.width / 2,
              y,
              width: image.width,
              height: image.height,
              fileId: image.fileId as any,
              scale: [1, 1] as [number, number],
              status: "saved" as const,
            };
          }),
        );
        excalidrawAPIRef.current.updateScene({
          elements: [
            ...excalidrawAPIRef.current.getSceneElementsIncludingDeleted(),
            ...imageElements,
          ],
          appState: {
            selectedElementIds: Object.fromEntries(
              imageElements.map((element: any) => [element.id, true]),
            ),
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      } catch (err) {
        console.error("[Editor] Failed to import dropped images", err);
        toast.error("Failed to import dropped images");
      }
    },
    [canEdit, excalidrawAPIRef],
  );

  useEffect(() => {
    if (!canEdit || !drawingId || !isReady) return;
    const interval = window.setInterval(() => {
      if (isUnmountingRef.current) return;
      if (isSyncingRef.current) return;
      if (!excalidrawAPIRef.current) return;
      const nextFiles = excalidrawAPIRef.current.getFiles?.() || {};
      const didEmit = emitFilesDeltaIfNeeded(nextFiles);
      if (didEmit && latestAppStateRef.current && debouncedSaveRef.current) {
        hasSceneChangesSinceLoadRef.current = true;
        lastLocalChangeAtRef.current = Date.now();
        debouncedSaveRef.current(
          drawingId,
          latestElementsRef.current,
          latestAppStateRef.current,
          nextFiles,
        );
        debouncedSavePreview(drawingId);
      }
    }, FILES_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [
    canEdit,
    debouncedSavePreview,
    debouncedSaveRef,
    drawingId,
    emitFilesDeltaIfNeeded,
    excalidrawAPIRef,
    hasSceneChangesSinceLoadRef,
    isReady,
    isSyncingRef,
    isUnmountingRef,
    lastLocalChangeAtRef,
    latestAppStateRef,
    latestElementsRef,
  ]);

  return { handleCanvasChange, handleCanvasDropCapture };
};
