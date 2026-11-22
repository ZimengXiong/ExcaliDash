import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  const lastSelectedIdRef = useRef<string | null>(null);
  const latestSelection = useRef({ drawings, selectedIds });
  useLayoutEffect(() => {
    latestSelection.current = { drawings, selectedIds };
  }, [drawings, selectedIds]);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);

  const resetSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  const selectionBounds = useMemo<SelectionBounds | null>(() => {
    if (!dragStart || !dragCurrent) return null;
    return getSelectionBounds(dragStart, dragCurrent);
  }, [dragStart, dragCurrent]);

  useEffect(() => {
    if (!isDragSelecting) return;
    const handleMouseMove = (event: MouseEvent) => {
      setDragCurrent({ x: event.clientX, y: event.clientY });
    };
    const handleMouseUp = () => {
      if (!dragStart || !dragCurrent) {
        setIsDragSelecting(false);
        setDragStart(null);
        setDragCurrent(null);
        return;
      }
      const selectionRect = getSelectionBounds(dragStart, dragCurrent);
      if (selectionRect.width > 5 || selectionRect.height > 5) {
        const nextSelectedIds = new Set(selectedIds);
        drawings.forEach((drawing) => {
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
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragSelecting,
    dragStart,
    dragCurrent,
    drawings,
    selectedIds,
    setSelectedIds,
  ]);

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
        lastSelectedIdRef.current = null;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawings, searchInputRef, setSelectedIds]);

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
    setIsDragSelecting(true);
    setDragStart({ x: event.clientX, y: event.clientY });
    setDragCurrent({ x: event.clientX, y: event.clientY });
  };

  const handleToggleSelection = useCallback(
    (id: string, event: React.MouseEvent) => {
      const { drawings, selectedIds } = latestSelection.current;
      const lastSelectedId = lastSelectedIdRef.current;
      const next = new Set(selectedIds);
      if (event.shiftKey && lastSelectedId) {
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
          setSelectedIds(next);
          return;
        }
      }
      if (next.has(id)) {
        next.delete(id);
        lastSelectedIdRef.current = null;
      } else {
        next.add(id);
        lastSelectedIdRef.current = id;
      }
      setSelectedIds(next);
    },
    [setSelectedIds],
  );

  const shouldSelectDrawing = useCallback((event: React.MouseEvent) => {
    return (
      latestSelection.current.selectedIds.size > 0 ||
      event.shiftKey ||
      event.metaKey ||
      event.ctrlKey
    );
  }, []);

  const allSelected =
    drawings.length > 0 && selectedIds.size === drawings.length;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      lastSelectedIdRef.current = null;
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
    shouldSelectDrawing,
    handleSelectAll,
  };
};
