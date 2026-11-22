import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { NavigateFunction } from "react-router-dom";
import * as api from "../../api";
import type { Collection, DrawingSummary } from "../../types";
import type { DrawingSortField, SortDirection } from "../../api";
import { mutateDashboardDrawings, sortDrawings } from "./useDashboardData";
import { scopePreviewSvgIds } from "../../utils/previewSvg";

const scopeDragPreview = (svg: string | undefined) =>
  svg ? scopePreviewSvgIds(svg, "drag-") : svg;

type UseDashboardDrawingActionsParams = {
  listKey: string;
  sortField: DrawingSortField;
  sortDirection: SortDirection;
  drawings: DrawingSummary[];
  setDrawings: React.Dispatch<React.SetStateAction<DrawingSummary[]>>;
  collections: Collection[];
  selectedCollectionId: string | null | undefined;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTotalCount: React.Dispatch<React.SetStateAction<number>>;
  uploadFiles: (files: File[], collectionId: string | null) => Promise<void>;
  refreshDrawings: () => Promise<void>;
  refreshCurrentDrawings: () => Promise<void>;
  navigate: NavigateFunction;
};

const showTemporaryViewerError = (
  message: string,
  setViewerActionError: React.Dispatch<React.SetStateAction<string | null>>,
) => {
  setViewerActionError(message);
  setTimeout(() => setViewerActionError(null), 3000);
};

// A partial failure still has to wait for the other mutations before reloading.
const runForDrawings = async (
  ids: string[],
  mutate: (id: string) => Promise<unknown>,
) => {
  const results = await Promise.allSettled(ids.map(mutate));
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected) throw rejected.reason;
};

export const useDashboardDrawingActions = ({
  listKey,
  sortField,
  sortDirection,
  drawings,
  setDrawings,
  collections,
  selectedCollectionId,
  selectedIds,
  setSelectedIds,
  setTotalCount,
  uploadFiles,
  refreshDrawings,
  refreshCurrentDrawings,
  navigate,
}: UseDashboardDrawingActionsParams) => {
  const [confirmationView, setConfirmationView] = useState(listKey);
  const [drawingToDelete, setDrawingToDelete] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showImportError, setShowImportError] = useState<{
    isOpen: boolean;
    message: string;
  }>({ isOpen: false, message: "" });
  const [viewerActionError, setViewerActionError] = useState<string | null>(
    null,
  );
  const [dragPreviewDrawings, setDragPreviewDrawings] = useState<{
    drawings: DrawingSummary[];
    count: number;
  } | null>(null);
  if (confirmationView !== listKey) {
    setConfirmationView(listKey);
    setDrawingToDelete(null);
    setShowBulkDeleteConfirm(false);
  }
  const drawingPreviews = useRef(new Map<string, string>());
  const dragSelection = useRef({ drawings, selectedIds });

  useLayoutEffect(() => {
    dragSelection.current = { drawings, selectedIds };
  }, [drawings, selectedIds]);

  const isTrashView = selectedCollectionId === "trash";
  const isSharedView = selectedCollectionId === "shared";
  const currentCollection = collections.find(
    (collection) => collection.id === selectedCollectionId,
  );
  const isSharedCollection = !!(
    selectedCollectionId !== "trash" &&
    currentCollection &&
    currentCollection.isOwner === false
  );

  const handleViewerActionError = (message: string) =>
    showTemporaryViewerError(message, setViewerActionError);

  const handleCreateDrawing = async () => {
    if (isTrashView || isSharedView) return;
    if (isSharedCollection && currentCollection?.sharedRole !== "edit") {
      handleViewerActionError("Viewers can't create new drawings");
      return;
    }
    try {
      const targetCollectionId =
        selectedCollectionId === undefined ? null : selectedCollectionId;
      const { id } = await mutateDashboardDrawings(
        () => api.createDrawing("Untitled Drawing", targetCollectionId),
        { changesExisting: false },
      );
      navigate(`/editor/${id}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Imports add drawings to other cached lists (e.g. All Drawings) too.
  const importFiles = (files: File[], collectionId: string | null) =>
    mutateDashboardDrawings(() => uploadFiles(files, collectionId), {
      changesExisting: false,
    })
      .catch((error) => console.error("Failed to import drawings:", error))
      .finally(refreshCurrentDrawings);

  const handleImportDrawings = async (files: FileList | null) => {
    if (!files || isTrashView || isSharedView) return;
    if (isSharedCollection && currentCollection?.sharedRole !== "edit") {
      handleViewerActionError("Viewers can't import drawings");
      return;
    }
    const targetCollectionId =
      selectedCollectionId === undefined ? null : selectedCollectionId;
    void importFiles(Array.from(files), targetCollectionId);
  };

  const isCurrentDrawing = useCallback(
    (id: string) =>
      drawings.some(
        (drawing) =>
          drawing.id === id &&
          (!isTrashView || drawing.collectionId === "trash"),
      ),
    [drawings, isTrashView],
  );
  const getSelectedDrawingIds = () =>
    Array.from(selectedIds).filter(isCurrentDrawing);

  const applyDrawingChanges = useCallback(
    (update: (drawing: DrawingSummary) => DrawingSummary | null) => {
      const next = drawings
        .map(update)
        .filter((drawing): drawing is DrawingSummary => drawing !== null);
      setDrawings(next);
      const removed = drawings.length - next.length;
      if (removed > 0) setTotalCount((count) => count - removed);
    },
    [drawings, setDrawings, setTotalCount],
  );

  const removeDrawings = useCallback(
    (ids: Set<string>) => {
      applyDrawingChanges((drawing) => (ids.has(drawing.id) ? null : drawing));
      setSelectedIds(
        (current) => new Set([...current].filter((id) => !ids.has(id))),
      );
    },
    [applyDrawingChanges, setSelectedIds],
  );

  const changeDrawings = useCallback(
    async (mutate: () => Promise<unknown>, errorMessage: string) => {
      try {
        await mutateDashboardDrawings(mutate);
      } catch (error) {
        console.error(errorMessage, error);
      } finally {
        await refreshCurrentDrawings();
      }
    },
    [refreshCurrentDrawings],
  );

  const handleRenameDrawing = useCallback(
    async (id: string, name: string) => {
      if (!isCurrentDrawing(id)) return;
      setDrawings((current) => {
        const next = current.map((drawing) =>
          drawing.id === id ? { ...drawing, name } : drawing,
        );
        return sortField === "name"
          ? sortDrawings(next, sortField, sortDirection)
          : next;
      });
      await changeDrawings(
        () => api.updateDrawing(id, { name }),
        "Failed to rename drawing:",
      );
    },
    [isCurrentDrawing, setDrawings, sortField, sortDirection, changeDrawings],
  );

  const moveDrawings = useCallback(
    async (ids: string[], collectionId: string | null) => {
      if (ids.length === 0) return;
      const targets = new Set(ids);
      applyDrawingChanges((drawing) => {
        if (!targets.has(drawing.id)) return drawing;
        const staysInView =
          selectedCollectionId === undefined
            ? collectionId !== "trash"
            : collectionId === selectedCollectionId;
        return staysInView ? { ...drawing, collectionId } : null;
      });
      setSelectedIds(
        (current) => new Set([...current].filter((id) => !targets.has(id))),
      );
      await changeDrawings(
        () =>
          runForDrawings(ids, (id) => api.updateDrawing(id, { collectionId })),
        "Failed to move drawing:",
      );
    },
    [applyDrawingChanges, changeDrawings, selectedCollectionId, setSelectedIds],
  );

  const handleDeleteDrawing = useCallback(
    async (id: string) => {
      if (!isCurrentDrawing(id)) return;
      if (isTrashView) setDrawingToDelete(id);
      else await moveDrawings([id], "trash");
    },
    [isCurrentDrawing, isTrashView, moveDrawings],
  );

  const permanentlyDeleteDrawings = async (ids: string[]) => {
    if (!isTrashView || ids.length === 0) return;
    let restoredElsewhere = false;
    const deletedIds = new Set<string>();
    await changeDrawings(
      () =>
        runForDrawings(ids, (id) =>
          api
            .deleteDrawing(id, { requireTrashed: true })
            .then(() => {
              deletedIds.add(id);
            })
            .catch((error) => {
              if (api.isAxiosError(error) && error.response?.status === 409) {
                restoredElsewhere = true;
                return;
              }
              throw error;
            }),
        ),
      "Failed to delete drawing:",
    );
    if (deletedIds.size > 0) {
      setSelectedIds(
        (current) => new Set([...current].filter((id) => !deletedIds.has(id))),
      );
    }
    if (restoredElsewhere) {
      handleViewerActionError(
        "A drawing was restored from Trash elsewhere and was not deleted",
      );
    }
  };

  const executePermanentDelete = async (id: string) => {
    setDrawingToDelete(null);
    if (isCurrentDrawing(id)) await permanentlyDeleteDrawings([id]);
  };

  const handleBulkDeleteClick = () => {
    const ids = getSelectedDrawingIds();
    if (ids.length === 0) return;
    if (isTrashView) setShowBulkDeleteConfirm(true);
    else void moveDrawings(ids, "trash");
  };

  const executeBulkPermanentDelete = async () => {
    setShowBulkDeleteConfirm(false);
    await permanentlyDeleteDrawings(getSelectedDrawingIds());
  };

  const handleBulkMove = (collectionId: string | null) =>
    moveDrawings(getSelectedDrawingIds(), collectionId);

  const handleHideSharedDrawing = useCallback(
    async (id: string) => {
      if (!isCurrentDrawing(id)) return;
      removeDrawings(new Set([id]));
      await changeDrawings(
        () => api.setSharedDrawingHidden(id, true),
        "Failed to hide shared drawing:",
      );
    },
    [changeDrawings, isCurrentDrawing, removeDrawings],
  );

  const duplicateDrawings = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        await mutateDashboardDrawings(
          () => runForDrawings(ids, api.duplicateDrawing),
          { changesExisting: false },
        );
      } catch (error) {
        console.error("Failed to duplicate drawing:", error);
      } finally {
        // This callback is scoped to the view where the action started.
        await refreshDrawings();
      }
    },
    [refreshDrawings],
  );

  const handleDuplicateDrawing = useCallback(
    (id: string) => {
      if (isCurrentDrawing(id)) return duplicateDrawings([id]);
    },
    [duplicateDrawings, isCurrentDrawing],
  );

  const handleBulkDuplicate = () => duplicateDrawings(getSelectedDrawingIds());

  const handleMoveToCollection = useCallback(
    (id: string, collectionId: string | null) => {
      if (isCurrentDrawing(id)) return moveDrawings([id], collectionId);
    },
    [isCurrentDrawing, moveDrawings],
  );

  const handleDrop = async (
    event: React.DragEvent,
    targetCollectionId: string | null,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (isSharedView) return;
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const files = Array.from(event.dataTransfer.files);
      const libFiles = files.filter((file) =>
        file.name.endsWith(".excalidrawlib"),
      );
      if (libFiles.length > 0) {
        setShowImportError({
          isOpen: true,
          message:
            "Library (.excalidrawlib) imports are not supported in this build. Please import drawings (.excalidraw/.json) instead.",
        });
      }
      const drawingFiles = files.filter(
        (file) => !file.name.endsWith(".excalidrawlib"),
      );
      if (drawingFiles.length > 0) {
        void importFiles(drawingFiles, targetCollectionId);
      }
      return;
    }
    const draggedDrawingId = event.dataTransfer.getData("drawingId");
    if (!isCurrentDrawing(draggedDrawingId)) return;
    setDragPreviewDrawings(null);
    const ids = selectedIds.has(draggedDrawingId)
      ? getSelectedDrawingIds()
      : [draggedDrawingId];
    await moveDrawings(ids, targetCollectionId);
  };

  const handleCardDragStart = useCallback(
    (event: React.DragEvent, id: string) => {
      const { drawings, selectedIds } = dragSelection.current;
      const dragged =
        selectedIds.has(id) && selectedIds.size > 1
          ? drawings.filter((drawing) => selectedIds.has(drawing.id))
          : drawings.filter((drawing) => drawing.id === id);
      // The browser captures the drag image synchronously during dragstart.
      flushSync(() => {
        setDragPreviewDrawings({
          count: dragged.length,
          drawings: dragged.slice(0, 3).map((drawing) => ({
            ...drawing,
            // The card stays mounted; give this copy its own SVG ids.
            preview: scopeDragPreview(drawingPreviews.current.get(drawing.id)),
          })),
        });
      });
      const preview = document.getElementById("drag-preview");
      if (preview) event.dataTransfer.setDragImage(preview, 80, 50);
    },
    [],
  );

  const handleCardDragEnd = useCallback(() => setDragPreviewDrawings(null), []);

  const handlePreviewReady = useCallback((id: string, preview: string) => {
    const previews = drawingPreviews.current;
    previews.set(id, preview);
    return () => {
      previews.delete(id);
    };
  }, []);

  return {
    drawingToDelete,
    showBulkDeleteConfirm,
    showImportError,
    viewerActionError,
    isTrashView,
    isSharedView,
    currentCollection,
    isSharedCollection,
    dragPreviewDrawings,
    setDrawingToDelete,
    setShowBulkDeleteConfirm,
    setShowImportError,
    handleViewerActionError,
    handleCreateDrawing,
    handleImportDrawings,
    handleRenameDrawing,
    handleDeleteDrawing,
    handleHideSharedDrawing,
    executePermanentDelete,
    handleBulkDeleteClick,
    executeBulkPermanentDelete,
    handleBulkMove,
    handleDuplicateDrawing,
    handleBulkDuplicate,
    handleMoveToCollection,
    handleDrop,
    handleCardDragStart,
    handleCardDragEnd,
    handlePreviewReady,
  };
};
