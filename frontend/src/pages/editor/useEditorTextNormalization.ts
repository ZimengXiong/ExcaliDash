import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";

type UseEditorTextNormalizationArgs = {
  isReady: boolean;
  excalidrawAPI: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  latestElementsRef: MutableRefObject<readonly any[]>;
  normalizeTextElementDimensions: (elements: readonly any[]) => readonly any[];
  recordElementVersion: (element: any) => void;
};

/**
 * Excalidraw loads its canvas fonts after the initial scene is restored. Text
 * measured against the browser fallback font can therefore retain a too-small
 * box and be clipped even though the final glyphs render with the right font.
 * Remeasure once the FontFaceSet settles, and again for any later font load.
 */
export const useEditorTextNormalization = ({
  isReady,
  excalidrawAPI,
  isSyncing,
  latestElementsRef,
  normalizeTextElementDimensions,
  recordElementVersion,
}: UseEditorTextNormalizationArgs) => {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isReady || !excalidrawAPI.current) return;
    let cancelled = false;

    const repair = () => {
      rafRef.current = null;
      if (cancelled || !excalidrawAPI.current) return;
      const current =
        excalidrawAPI.current.getSceneElementsIncludingDeleted?.() ?? [];
      if (!current.some((element: any) => element?.type === "text")) return;
      const normalized = normalizeTextElementDimensions(current);
      isSyncing.current = true;
      try {
        excalidrawAPI.current.updateScene({
          elements: normalized,
          captureUpdate: "NEVER",
        });
        latestElementsRef.current = normalized;
        normalized.forEach((element: any) => recordElementVersion(element));
      } finally {
        isSyncing.current = false;
      }
    };

    const scheduleRepair = () => {
      if (cancelled || rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(repair);
    };

    const fontSet = document.fonts;
    fontSet?.addEventListener?.("loadingdone", scheduleRepair);
    void (fontSet?.ready ?? Promise.resolve()).then(scheduleRepair);

    return () => {
      cancelled = true;
      fontSet?.removeEventListener?.("loadingdone", scheduleRepair);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    excalidrawAPI,
    isReady,
    isSyncing,
    latestElementsRef,
    normalizeTextElementDimensions,
    recordElementVersion,
  ]);
};
