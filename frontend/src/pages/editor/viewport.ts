import { useEffect, useMemo } from "react";
import { debounce } from "lodash";

type Viewport = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
};

const storageKey = (userId: string, drawingId: string) =>
  `excalidash:viewport:${JSON.stringify([userId, drawingId])}`;

const isViewport = (value: unknown): value is Viewport => {
  if (!value || typeof value !== "object") return false;
  const viewport = value as Viewport;
  return (
    Number.isFinite(viewport.scrollX) &&
    Number.isFinite(viewport.scrollY) &&
    Number.isFinite(viewport.zoom?.value) &&
    viewport.zoom.value > 0
  );
};

export const readViewport = (
  userId: string,
  drawingId: string,
): Viewport | null => {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storageKey(userId, drawingId)) ?? "null",
    );
    return isViewport(value) ? value : null;
  } catch {
    return null;
  }
};

export const useRememberViewport = (userId: string, drawingId?: string) => {
  const remember = useMemo(
    () =>
      debounce(
        (scrollX: number, scrollY: number, zoom: { value: number }) => {
          const viewport = { scrollX, scrollY, zoom: { value: zoom.value } };
          if (!drawingId || !isViewport(viewport)) return;
          try {
            localStorage.setItem(
              storageKey(userId, drawingId),
              JSON.stringify(viewport),
            );
          } catch {
            // Disabled or full browser storage must never interrupt the editor.
          }
        },
        150,
        { maxWait: 500 },
      ),
    [userId, drawingId],
  );

  useEffect(() => {
    const flush = () => {
      remember.flush();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("blur", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("blur", flush);
      remember.flush();
      remember.cancel();
    };
  }, [remember]);

  return remember;
};
