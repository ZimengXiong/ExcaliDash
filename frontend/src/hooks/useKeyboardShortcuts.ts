/**
 * Custom hook for keyboard shortcuts
 * Extracts keyboard handling logic from Dashboard.tsx
 */
import { useEffect, type RefObject } from 'react';

interface UseKeyboardShortcutsOptions {
  items: { id: string }[];
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setLastSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  searchInputRef: RefObject<HTMLInputElement>;
}

export const useKeyboardShortcuts = ({
  items,
  setSelectedIds,
  setLastSelectedId,
  searchInputRef,
}: UseKeyboardShortcutsOptions) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+A or Ctrl+A to Select All
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // Don't select all if user is typing in an input
        if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
          return;
        }
        e.preventDefault();
        const allIds = new Set(items.map(d => d.id));
        setSelectedIds(allIds);
      }

      // Escape to Clear Selection
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedIds(new Set());
        setLastSelectedId(null);
      }

      // Cmd+K to Search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, setSelectedIds, setLastSelectedId, searchInputRef]);
};
