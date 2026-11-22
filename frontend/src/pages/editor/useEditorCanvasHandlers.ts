import { useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  getCommonBounds,
  restoreElements,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { toast } from "sonner";
import {
  createDroppedId,
  type DroppedImageData,
  type DropViewport,
  fitDroppedImageToViewport,
  getDroppedImageFiles,
  isSupportedDroppedImageFile,
  loadDroppedImageData,
  MULTI_IMAGE_DROP_GAP,
} from "./droppedImages";
import {
  createDroppedFileMerger,
  type DroppedSceneFile,
  MAX_DROP_BYTES,
  MAX_DROP_FILE_BYTES,
  mayContainExcalidrawScene,
  prepareSceneElementsForAppend,
  readDroppedScene,
  validateDroppedScene,
  withSceneMimeType,
} from "./droppedScenes";
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
  initialSceneElements: MutableRefObject<readonly any[]>;
  isBootstrappingScene: MutableRefObject<boolean>;
  isSyncing: MutableRefObject<boolean>;
  isUnmounting: MutableRefObject<boolean>;
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
  files: readonly DroppedSceneFile[];
  place: (
    topLeft: { x: number; y: number },
    fileIds: ReadonlyMap<string, string>,
  ) => any[];
};

const imageItem = (
  image: DroppedImageData,
  viewport: DropViewport,
): DroppedItem => {
  const { width, height } = fitDroppedImageToViewport(image, viewport);
  return {
    width,
    height,
    files: [
      {
        id: image.fileId,
        mimeType: image.mimeType,
        dataURL: image.dataURL,
        created: image.created,
      },
    ],
    place: ({ x, y }, fileIds) =>
      convertToExcalidrawElements([
        {
          type: "image" as const,
          x,
          y,
          width,
          height,
          fileId: (fileIds.get(image.fileId) ?? image.fileId) as any,
          scale: [1, 1] as [number, number],
          status: "saved" as const,
        },
      ]),
  };
};

const sceneItem = (
  scene: Extract<ReturnType<typeof validateDroppedScene>, { type: "scene" }>,
  destination: URL,
): DroppedItem | null => {
  const elements = restoreElements(scene.elements, null, {
    repairBindings: true,
    refreshDimensions: false,
  }).filter((element) => !element.isDeleted);
  if (elements.length === 0) return null;
  const bounds = getCommonBounds(elements);
  const width = bounds[2] - bounds[0];
  const height = bounds[3] - bounds[1];
  if (![...bounds, width, height].every(Number.isFinite)) {
    throw new Error("Invalid drawing bounds");
  }
  return {
    width,
    height,
    files: scene.files,
    place: (origin, fileIds) =>
      prepareSceneElementsForAppend(elements, {
        bounds,
        origin,
        createId: createDroppedId,
        destination,
        source: scene.source,
        fileIds,
      }),
  };
};

type UseEditorCanvasHandlersParams = {
  appendDroppedDrawings: boolean;
  canEdit: boolean;
  debouncedSavePreview: (drawingId: string) => void;
  drawingId: string | undefined;
  emitFilesDeltaIfNeeded: (nextFiles: Record<string, any>) => boolean;
  isReady: boolean;
  markSceneChanged: () => void;
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
  appendDroppedDrawings,
  canEdit,
  debouncedSavePreview,
  drawingId,
  emitFilesDeltaIfNeeded,
  isReady,
  markSceneChanged,
  refs,
  resolveSafeSnapshot,
  broadcastChanges,
}: UseEditorCanvasHandlersParams) => {
  const {
    debouncedSave: debouncedSaveRef,
    excalidrawAPI: excalidrawAPIRef,
    hasHydratedInitialScene: hasHydratedInitialSceneRef,
    initialSceneElements: initialSceneElementsRef,
    isBootstrappingScene: isBootstrappingSceneRef,
    isSyncing: isSyncingRef,
    isUnmounting: isUnmountingRef,
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
      if (appState.isLoading) return;
      const previousAppState = latestAppStateRef.current;
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
      if (
        drawingId &&
        previousAppState &&
        (appState.viewBackgroundColor !==
          previousAppState.viewBackgroundColor ||
          appState.gridSize !== previousAppState.gridSize ||
          appState.gridStep !== previousAppState.gridStep ||
          appState.gridModeEnabled !== previousAppState.gridModeEnabled)
      ) {
        markSceneChanged();
        debouncedSaveRef.current?.(
          drawingId,
          allElements,
          appState,
          currentFiles,
        );
        debouncedSavePreview(drawingId);
      }
      broadcastChanges(allElements, currentFiles);
    },
    [
      broadcastChanges,
      canEdit,
      debouncedSavePreview,
      debouncedSaveRef,
      drawingId,
      excalidrawAPIRef,
      hasHydratedInitialSceneRef,
      initialSceneElementsRef,
      isBootstrappingSceneRef,
      isSyncingRef,
      isUnmountingRef,
      latestAppStateRef,
      latestElementsRef,
      latestFilesRef,
      markSceneChanged,
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
      const existingElements: readonly any[] =
        api.getSceneElementsIncludingDeleted();
      const existingFileIds = existingElements.flatMap((element) =>
        typeof element.fileId === "string" ? [element.fileId] : [],
      );
      const { merge, files } = createDroppedFileMerger(
        api.getFiles(),
        existingFileIds,
        createDroppedId,
      );
      const newElements: any[] = [];
      let nextY = dropPoint.y - items[0].height / 2;
      for (const item of items) {
        const placed = item.place(
          {
            x: dropPoint.x - item.width / 2,
            y: nextY,
          },
          merge(item.files),
        );
        for (const element of placed) newElements.push(element);
        nextY += item.height + MULTI_IMAGE_DROP_GAP;
      }
      if (files.length > 0) api.addFiles(files);
      // Select a frame without its children, as Excalidraw does.
      // Selecting both moves the children twice when you drag the selection.
      const topLevel = newElements.filter((element) => !element.frameId);
      api.updateScene({
        elements: [...existingElements, ...newElements],
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
      const api = excalidrawAPIRef.current;
      if (!canEdit || !api) return;
      const allDroppedFiles = Array.from(event.dataTransfer?.files || []);
      const appendScenes =
        appendDroppedDrawings &&
        allDroppedFiles.some(mayContainExcalidrawScene);
      const droppedImages = getDroppedImageFiles(event.dataTransfer);
      const insertMultipleImages =
        droppedImages.length > 1 &&
        droppedImages.length === allDroppedFiles.length;
      if (!appendScenes && !insertMultipleImages) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        const destination = new URL(window.location.href);
        const stillOnDrawing = () =>
          !isUnmountingRef.current &&
          excalidrawAPIRef.current === api &&
          window.location.pathname === destination.pathname;
        const appState = api.getAppState?.();
        if (!appState) return;
        const dropPoint = viewportCoordsToSceneCoords(
          { clientX: event.clientX, clientY: event.clientY },
          appState,
        );
        const viewport: DropViewport = {
          height: appState.height,
          zoom: appState.zoom.value,
        };
        const items: DroppedItem[] = [];
        let inputBytes = 0;
        const sceneBudget = { remaining: MAX_DROP_BYTES };
        for (const file of allDroppedFiles) {
          if (!stillOnDrawing()) return;
          const name = file.name || "dropped file";
          const isSceneCandidate =
            appendScenes && mayContainExcalidrawScene(file);
          if (!isSceneCandidate && !isSupportedDroppedImageFile(file)) {
            toast.error(`Skipped unsupported file: ${name}`);
            continue;
          }
          if (
            file.size > MAX_DROP_FILE_BYTES ||
            inputBytes + file.size > MAX_DROP_BYTES
          ) {
            toast.error(`Skipped ${name}: drop size limit exceeded`);
            continue;
          }
          inputBytes += file.size;
          try {
            const typed = isSceneCandidate ? withSceneMimeType(file) : file;
            const decoded = isSceneCandidate
              ? await readDroppedScene(typed, sceneBudget)
              : null;
            if (!stillOnDrawing()) return;
            if (decoded === null) {
              items.push(
                imageItem(await loadDroppedImageData(typed), viewport),
              );
              continue;
            }
            const scene = validateDroppedScene(decoded.data);
            if (scene.type === "library") {
              await api.updateLibrary({
                libraryItems: new Blob([decoded.text], {
                  type: "application/vnd.excalidrawlib+json",
                }),
                merge: true,
                openLibraryMenu: true,
              });
              continue;
            }
            const item = sceneItem(scene, destination);
            if (item) items.push(item);
          } catch (error) {
            console.error("[Editor] Failed to import dropped file", error);
            toast.error(`Could not import ${name}`);
          }
        }
        if (stillOnDrawing()) insertDroppedItems(items, dropPoint);
      } catch (err) {
        console.error("[Editor] Failed to import dropped files", err);
        toast.error("Failed to import dropped files");
      }
    },
    [
      appendDroppedDrawings,
      canEdit,
      excalidrawAPIRef,
      insertDroppedItems,
      isUnmountingRef,
    ],
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
        markSceneChanged();
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
    isReady,
    isSyncingRef,
    isUnmountingRef,
    markSceneChanged,
    latestAppStateRef,
    latestElementsRef,
  ]);

  return { handleCanvasChange, handleCanvasDropCapture };
};
