import React, { useMemo, useState } from "react";
import type { NavigateFunction } from "react-router-dom";
import * as api from "../../api";
import type { Collection, DrawingSummary } from "../../types";

type UseDashboardDrawingActionsParams = {
  drawings: DrawingSummary[];
  setDrawings: React.Dispatch<React.SetStateAction<DrawingSummary[]>>;
  collections: Collection[];
  selectedCollectionId: string | null | undefined;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setTotalCount: React.Dispatch<React.SetStateAction<number>>;
  uploadFiles: (files: File[], collectionId: string | null) => Promise<void>;
  refreshData: () => void;
  navigate: NavigateFunction;
};

const showTemporaryViewerError = (
  message: string,
  setViewerActionError: React.Dispatch<React.SetStateAction<string | null>>,
) => {
  setViewerActionError(message);
  setTimeout(() => setViewerActionError(null), 3000);
};

export const useDashboardDrawingActions = ({
  drawings,
  setDrawings,
  collections,
  selectedCollectionId,
  selectedIds,
  setSelectedIds,
  setTotalCount,
  uploadFiles,
  refreshData,
  navigate,
}: UseDashboardDrawingActionsParams) => {
  const [drawingToDelete, setDrawingToDelete] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showImportError, setShowImportError] = useState<{
    isOpen: boolean;
    message: string;
  }>({ isOpen: false, message: "" });
  const [viewerActionError, setViewerActionError] = useState<string | null>(
    null,
  );
  const [potentialDragId, setPotentialDragId] = useState<string | null>(null);

  const isTrashView = selectedCollectionId === "trash";
  const isSharedView = selectedCollectionId === "shared";
  const currentCollection = collections.find(
    (collection) => collection.id === selectedCollectionId,
  );
  const isSharedCollection = !!(
    currentCollection && currentCollection.isOwner === false
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
      const { id } = await api.createDrawing(
        "Untitled Drawing",
        targetCollectionId,
      );
      navigate(`/editor/${id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportDrawings = async (files: FileList | null) => {
    if (!files || isTrashView || isSharedView) return;
    if (isSharedCollection && currentCollection?.sharedRole !== "edit") {
      handleViewerActionError("Viewers can't import drawings");
      return;
    }
    const targetCollectionId =
      selectedCollectionId === undefined ? null : selectedCollectionId;
    uploadFiles(Array.from(files), targetCollectionId).finally(refreshData);
  };

  const handleRenameDrawing = async (id: string, name: string) => {
    setDrawings((current) =>
      current.map((drawing) =>
        drawing.id === id ? { ...drawing, name } : drawing,
      ),
    );
    try {
      await api.updateDrawing(id, { name });
    } catch (err) {
      console.error("Failed to rename drawing:", err);
      refreshData();
    }
  };

  const moveOutOfCurrentView = (
    update: (drawing: DrawingSummary) => DrawingSummary,
    keep: (drawing: DrawingSummary) => boolean,
  ) => {
    setDrawings((current) => {
      const updated = current.map(update);
      const next = updated.filter(keep);
      setTotalCount((count) => count - (current.length - next.length));
      return next;
    });
  };

  // Drop a single drawing from the current list + selection (optimistic).
  const removeDrawingFromList = (id: string) => {
    setDrawings((current) => {
      const next = current.filter((drawing) => drawing.id !== id);
      if (next.length !== current.length) setTotalCount((count) => count - 1);
      return next;
    });
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const handleDeleteDrawing = async (id: string) => {
    if (isTrashView) {
      setDrawingToDelete(id);
      return;
    }
    removeDrawingFromList(id);
    try {
      await api.updateDrawing(id, { collectionId: "trash" });
    } catch (err) {
      console.error("Failed to move to trash", err);
      refreshData();
    }
  };

  const executePermanentDelete = async (id: string) => {
    setDrawingToDelete(null);
    try {
      await api.deleteDrawing(id);
      removeDrawingFromList(id);
    } catch (err) {
      console.error("Failed to delete drawing", err);
      refreshData();
    }
  };

  const executeBulkMoveToTrash = async () => {
    const ids = Array.from(selectedIds);
    setDrawings((current) => {
      const next = current.filter((drawing) => !selectedIds.has(drawing.id));
      setTotalCount((count) => count - (current.length - next.length));
      return next;
    });
    setSelectedIds(new Set());
    try {
      await Promise.all(
        ids.map((id) => api.updateDrawing(id, { collectionId: "trash" })),
      );
    } catch (err) {
      console.error("Failed bulk move to trash", err);
      refreshData();
    }
  };

  const handleBulkDeleteClick = () => {
    if (selectedIds.size === 0) return;
    if (isTrashView) setShowBulkDeleteConfirm(true);
    else void executeBulkMoveToTrash();
  };

  const executeBulkPermanentDelete = async () => {
    const ids = Array.from(selectedIds);
    setShowBulkDeleteConfirm(false);
    try {
      await Promise.all(ids.map((id) => api.deleteDrawing(id)));
      const toDelete = new Set(ids);
      setDrawings((current) => {
        const next = current.filter((drawing) => !toDelete.has(drawing.id));
        setTotalCount((count) => count - (current.length - next.length));
        return next;
      });
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Failed bulk delete", err);
      refreshData();
    }
  };

  const handleBulkMove = async (collectionId: string | null) => {
    if (selectedIds.size === 0) return;
    const idsToMove = Array.from(selectedIds);
    moveOutOfCurrentView(
      (drawing) =>
        selectedIds.has(drawing.id) ? { ...drawing, collectionId } : drawing,
      (drawing) => {
        if (selectedCollectionId === undefined) return true;
        if (selectedCollectionId === null) return drawing.collectionId === null;
        return drawing.collectionId === selectedCollectionId;
      },
    );
    setSelectedIds(new Set());
    try {
      await Promise.all(
        idsToMove.map((id) => api.updateDrawing(id, { collectionId })),
      );
    } catch (err) {
      console.error("Failed bulk move", err);
      refreshData();
    }
  };

  const handleHideSharedDrawing = async (id: string) => {
    // Optimistically drop the shared drawing from the recipient's list.
    removeDrawingFromList(id);
    try {
      await api.setSharedDrawingHidden(id, true);
    } catch (err) {
      console.error("Failed to hide shared drawing", err);
      refreshData();
    }
  };

  const handleDuplicateDrawing = async (id: string) => {
    try {
      await api.duplicateDrawing(id);
      refreshData();
    } catch (err) {
      console.error("Failed to duplicate drawing:", err);
    }
  };

  const handleBulkDuplicate = async () => {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => api.duplicateDrawing(id)),
      );
      setSelectedIds(new Set());
      refreshData();
    } catch (err) {
      console.error("Failed bulk duplicate:", err);
    }
  };

  const handleMoveToCollection = async (
    id: string,
    collectionId: string | null,
  ) => {
    moveOutOfCurrentView(
      (drawing) => (drawing.id === id ? { ...drawing, collectionId } : drawing),
      (drawing) => {
        if (selectedCollectionId === undefined) return true;
        if (selectedCollectionId === null) return drawing.collectionId === null;
        return drawing.collectionId === selectedCollectionId;
      },
    );
    try {
      await api.updateDrawing(id, { collectionId });
    } catch (error) {
      console.error("Failed to move drawing:", error);
      refreshData();
    }
  };

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
        uploadFiles(drawingFiles, targetCollectionId).finally(refreshData);
      }
      return;
    }
    const draggedDrawingId = event.dataTransfer.getData("drawingId");
    if (!draggedDrawingId) return;
    const idsToMove = selectedIds.has(draggedDrawingId)
      ? new Set(selectedIds)
      : new Set([draggedDrawingId]);
    moveOutOfCurrentView(
      (drawing) =>
        idsToMove.has(drawing.id)
          ? { ...drawing, collectionId: targetCollectionId }
          : drawing,
      (drawing) => {
        if (selectedCollectionId === undefined) return true;
        if (selectedCollectionId === null) return drawing.collectionId === null;
        return drawing.collectionId === selectedCollectionId;
      },
    );
    if (selectedIds.has(draggedDrawingId)) setSelectedIds(new Set());
    try {
      await Promise.all(
        Array.from(idsToMove).map((id) =>
          api.updateDrawing(id, { collectionId: targetCollectionId }),
        ),
      );
    } catch (err) {
      console.error("Failed to move", err);
      refreshData();
    }
  };

  const dragPreviewDrawings = useMemo(() => {
    if (!potentialDragId) return [];
    if (selectedIds.has(potentialDragId) && selectedIds.size > 1) {
      return drawings.filter((drawing) => selectedIds.has(drawing.id));
    }
    const drawing = drawings.find((item) => item.id === potentialDragId);
    return drawing ? [drawing] : [];
  }, [potentialDragId, selectedIds, drawings]);

  const handleCardMouseDown = (_event: React.MouseEvent, id: string) => {
    setPotentialDragId(id);
  };

  const handleCardDragStart = (event: React.DragEvent) => {
    const preview = document.getElementById("drag-preview");
    if (preview) event.dataTransfer.setDragImage(preview, 80, 50);
  };

  const handlePreviewGenerated = (id: string, preview: string) => {
    setDrawings((current) =>
      current.map((drawing) =>
        drawing.id === id ? { ...drawing, preview } : drawing,
      ),
    );
  };

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
    handleCardMouseDown,
    handleCardDragStart,
    handlePreviewGenerated,
  };
};
