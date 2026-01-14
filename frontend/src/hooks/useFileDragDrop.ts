/**
 * Custom hook for file drag and drop functionality
 * Extracts file drag/drop logic from Dashboard.tsx
 */
import { useState, useCallback, useRef } from 'react';

export const useFileDragDrop = () => {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter.current += 1;
      if (dragCounter.current === 1) {
        setIsDraggingFile(true);
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter.current -= 1;
      if (dragCounter.current === 0) {
        setIsDraggingFile(false);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isDraggingFile && e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  }, [isDraggingFile]);

  const resetDragState = useCallback(() => {
    setIsDraggingFile(false);
    dragCounter.current = 0;
  }, []);

  return {
    isDraggingFile,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    resetDragState,
  };
};
