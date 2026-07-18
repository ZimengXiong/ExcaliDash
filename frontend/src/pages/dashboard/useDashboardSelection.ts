import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DrawingSummary } from "../../types";
import { getSelectionBounds, type Point, type SelectionBounds } from "./shared";

type UseDashboardSelectionParams = {
  drawings: DrawingSummary[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  searchInputRef: React.RefObject<HTMLInputElement>;
};

export const useDashboardSelection = ({
  drawings,
  selectedIds,
  setSelectedIds,
  searchInputRef,
}: UseDashboardSelectionParams) => {
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);
  const drawingsRef = useRef(drawings);
  const selectedIdsRef = useRef(selectedIds);
  const dragStartRef = useRef<Point | null>(null);
  const dragCurrentRef = useRef<Point | null>(null);
  drawingsRef.current = drawings;
  selectedIdsRef.current = selectedIds;

  const resetSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  const selectionBounds = useMemo<SelectionBounds | null>(() => {
    if (!dragStart || !dragCurrent) return null;
    return getSelectionBounds(dragStart, dragCurrent);
  }, [dragStart, dragCurrent]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragStartRef.current) return;
      const point = { x: event.clientX, y: event.clientY };
      dragCurrentRef.current = point;
      setDragCurrent(point);
    };
    const handleMouseUp = () => {
      const start = dragStartRef.current;
      const current = dragCurrentRef.current;
      if (!start || !current) {
        setIsDragSelecting(false);
        setDragStart(null);
        setDragCurrent(null);
        return;
      }
      const selectionRect = getSelectionBounds(start, current);
      if (selectionRect.width > 5 || selectionRect.height > 5) {
        const nextSelectedIds = new Set(selectedIdsRef.current);
        drawingsRef.current.forEach((drawing) => {
          const card = document.getElementById(`drawing-card-${drawing.id}`);
          if (!card) return;
          const rect = card.getBoundingClientRect();
          if (
            rect.left < selectionRect.right &&
            rect.right > selectionRect.left &&
            rect.top < selectionRect.bottom &&
            rect.bottom > selectionRect.top
          ) {
            nextSelectedIds.add(drawing.id);
          }
        });
        setSelectedIds(nextSelectedIds);
      }
      setIsDragSelecting(false);
      setDragStart(null);
      setDragCurrent(null);
      dragStartRef.current = null;
      dragCurrentRef.current = null;
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setSelectedIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "a") {
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        event.preventDefault();
        setSelectedIds(new Set(drawings.map((drawing) => drawing.id)));
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedIds(new Set());
        setLastSelectedId(null);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchInputRef, setSelectedIds]);

  const handleMouseDown = (event: React.MouseEvent) => {
    if (
      (event.target as HTMLElement).closest(
        "button, a, input, textarea, .drawing-card",
      )
    ) {
      return;
    }
    if (
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
      setSelectedIds(new Set());
    }
    const point = { x: event.clientX, y: event.clientY };
    dragStartRef.current = point;
    dragCurrentRef.current = point;
    setIsDragSelecting(true);
    setDragStart(point);
    setDragCurrent(point);
  };

  const handleToggleSelection = (id: string, event: React.MouseEvent) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (
        event.shiftKey &&
        lastSelectedId &&
        drawings.some((drawing) => drawing.id === lastSelectedId)
      ) {
        const currentIndex = drawings.findIndex((drawing) => drawing.id === id);
        const lastIndex = drawings.findIndex(
          (drawing) => drawing.id === lastSelectedId,
        );
        if (currentIndex !== -1 && lastIndex !== -1) {
          const start = Math.min(currentIndex, lastIndex);
          const end = Math.max(currentIndex, lastIndex);
          for (let index = start; index <= end; index++) {
            next.add(drawings[index].id);
          }
          return next;
        }
      }
      if (next.has(id)) {
        next.delete(id);
        setLastSelectedId(null);
      } else {
        next.add(id);
        setLastSelectedId(id);
      }
      return next;
    });
  };

  const allSelected =
    drawings.length > 0 && selectedIds.size === drawings.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      setLastSelectedId(null);
      return;
    }
    setSelectedIds(new Set(drawings.map((drawing) => drawing.id)));
  };

  return {
    selectedIds,
    setSelectedIds,
    isDragSelecting,
    selectionBounds,
    hasSelection: selectedIds.size > 0,
    allSelected,
    resetSelection,
    handleMouseDown,
    handleToggleSelection,
    handleSelectAll,
  };
};
