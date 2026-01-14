/**
 * Custom hook for bulk operations on drawings
 * Extracts bulk move/delete/duplicate logic from Dashboard.tsx
 */
import { useState, useCallback } from 'react';
import * as api from '../api';
import type { DrawingSummary } from '../types';

interface UseBulkOperationsOptions {
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setDrawings: React.Dispatch<React.SetStateAction<DrawingSummary[]>>;
  selectedCollectionId: string | null | undefined;
  refreshData: () => Promise<void>;
  isTrashView: boolean;
}

export const useBulkOperations = ({
  selectedIds,
  setSelectedIds,
  setDrawings,
  selectedCollectionId,
  refreshData,
  isTrashView,
}: UseBulkOperationsOptions) => {
  const [showBulkMoveMenu, setShowBulkMoveMenu] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const executeBulkMoveToTrash = useCallback(async () => {
    const trashId = 'trash';
    const ids = Array.from(selectedIds);

    setDrawings(prev => prev.filter(d => !selectedIds.has(d.id)));
    setSelectedIds(new Set());

    try {
      await Promise.all(ids.map(id => api.updateDrawing(id, { collectionId: trashId })));
    } catch (err) {
      console.error("Failed bulk move to trash", err);
      refreshData();
    }
  }, [selectedIds, setDrawings, setSelectedIds, refreshData]);

  const executeBulkPermanentDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setDrawings(prev => prev.filter(d => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);

    try {
      await Promise.all(ids.map(id => api.deleteDrawing(id)));
    } catch (err) {
      console.error("Failed bulk delete", err);
      refreshData();
    }
  }, [selectedIds, setDrawings, setSelectedIds, refreshData]);

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedIds.size === 0) return;
    if (isTrashView) {
      setShowBulkDeleteConfirm(true);
    } else {
      executeBulkMoveToTrash();
    }
  }, [selectedIds.size, isTrashView, executeBulkMoveToTrash]);

  const handleBulkMove = useCallback(async (collectionId: string | null) => {
    if (selectedIds.size === 0) return;

    const idsToMove = Array.from(selectedIds);

    // Optimistic update
    setDrawings(prev => {
      const updated = prev.map(d => selectedIds.has(d.id) ? { ...d, collectionId } : d);
      if (selectedCollectionId === undefined) return updated;
      return updated.filter(d => {
        if (selectedCollectionId === null) return d.collectionId === null;
        return d.collectionId === selectedCollectionId;
      });
    });
    setSelectedIds(new Set());
    setShowBulkMoveMenu(false);

    try {
      await Promise.all(idsToMove.map(id => api.updateDrawing(id, { collectionId })));
    } catch (err) {
      console.error("Failed bulk move", err);
      refreshData();
    }
  }, [selectedIds, selectedCollectionId, setDrawings, setSelectedIds, refreshData]);

  const handleBulkDuplicate = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map(id => api.duplicateDrawing(id)));
      setSelectedIds(new Set());
      refreshData();
    } catch (err) {
      console.error("Failed bulk duplicate:", err);
    }
  }, [selectedIds, setSelectedIds, refreshData]);

  return {
    showBulkMoveMenu,
    setShowBulkMoveMenu,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    handleBulkDeleteClick,
    handleBulkMove,
    handleBulkDuplicate,
    executeBulkPermanentDelete,
  };
};
