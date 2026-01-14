/**
 * Custom hook for drag selection functionality
 * Extracts drag selection logic from Dashboard.tsx
 */
import { useState, useCallback, useEffect } from 'react';

type Point = { x: number; y: number };

type SelectionBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const getSelectionBounds = (start: Point, current: Point): SelectionBounds => {
  const left = Math.min(start.x, current.x);
  const right = Math.max(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const bottom = Math.max(start.y, current.y);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

interface UseDragSelectionOptions<T extends { id: string }> {
  items: T[];
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  getItemElementId: (id: string) => string;
}

export const useDragSelection = <T extends { id: string }>({
  items,
  selectedIds,
  setSelectedIds,
  getItemElementId,
}: UseDragSelectionOptions<T>) => {
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);

  const selectionBounds = dragStart && dragCurrent
    ? getSelectionBounds(dragStart, dragCurrent)
    : null;

  useEffect(() => {
    if (!isDragSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragCurrent({ x: e.clientX, y: e.clientY });
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
        const newSelectedIds = new Set(selectedIds);
        items.forEach(item => {
          const card = document.getElementById(getItemElementId(item.id));
          if (card) {
            const rect = card.getBoundingClientRect();
            if (
              rect.left < selectionRect.right &&
              rect.right > selectionRect.left &&
              rect.top < selectionRect.bottom &&
              rect.bottom > selectionRect.top
            ) {
              newSelectedIds.add(item.id);
            }
          }
        });
        setSelectedIds(newSelectedIds);
      }

      setIsDragSelecting(false);
      setDragStart(null);
      setDragCurrent(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragSelecting, dragStart, dragCurrent, items, selectedIds, setSelectedIds, getItemElementId]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea, .drawing-card')) return;
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;

    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      setSelectedIds(new Set());
    }
    setIsDragSelecting(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragCurrent({ x: e.clientX, y: e.clientY });
  }, [setSelectedIds]);

  return {
    isDragSelecting,
    selectionBounds,
    handleMouseDown,
  };
};
