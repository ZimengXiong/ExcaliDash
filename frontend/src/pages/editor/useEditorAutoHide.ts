import { useCallback, useEffect, useMemo, useState } from "react";

export const useEditorAutoHide = (
  drawingId: string | undefined,
  defaultEnabled = true,
) => {
  const storageKey = useMemo(
    () => (drawingId ? `excalidash:editor:${drawingId}:autoHideEnabled` : null),
    [drawingId],
  );

  const getStoredAutoHideEnabled = useCallback((): boolean => {
    if (!storageKey) return defaultEnabled;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "1" || raw === "true") return true;
      if (raw === "0" || raw === "false") return false;
      return defaultEnabled;
    } catch {
      return defaultEnabled;
    }
  }, [defaultEnabled, storageKey]);

  const [autoHideEnabled, setAutoHideEnabled] = useState(
    getStoredAutoHideEnabled,
  );

  useEffect(() => {
    setAutoHideEnabled(getStoredAutoHideEnabled());
  }, [getStoredAutoHideEnabled]);

  const setAndStoreAutoHideEnabled = useCallback(
    (next: boolean) => {
      setAutoHideEnabled(next);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          // Ignore storage errors in restricted browser contexts.
        }
      }
    },
    [storageKey],
  );

  return {
    autoHideEnabled,
    setAutoHideEnabled: setAndStoreAutoHideEnabled,
  };
};
