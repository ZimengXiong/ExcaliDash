import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Drawing, DrawingSummary } from "../../types";
import {
  normalizePreviewSvg,
  isDefaultPreviewBackground,
  previewHasEmbeddedImages,
} from "../../utils/previewSvg";
import * as api from "../../api";

export type HydratedDrawingData = {
  elements: any[];
  appState: any;
  files: Record<string, any>;
};

const normalizeImageElementsForPreview = (
  elements: any[] = [],
  files: Record<string, any> = {},
): any[] =>
  elements.map((element) => {
    if (
      !element ||
      element.type !== "image" ||
      typeof element.fileId !== "string"
    ) {
      return element;
    }
    const file = files[element.fileId];
    const hasImageData =
      typeof file?.dataURL === "string" &&
      file.dataURL.startsWith("data:image/") &&
      file.dataURL.length > 0;
    if (!hasImageData || element.status === "saved") {
      return element;
    }
    return {
      ...element,
      status: "saved",
    };
  });

export const useDrawingPreview = (
  drawing: DrawingSummary,
  onPreviewGenerated?: (id: string, preview: string) => void,
  loadPreview = true,
) => {
  const [previewSvg, setPreviewSvg] = useState<string | null>(
    normalizePreviewSvg(drawing.preview) ?? null,
  );
  // Parent renders create new callbacks as sibling previews finish. Updating
  // the notification target must not cancel and restart every pending request.
  const onPreviewGeneratedRef = useRef(onPreviewGenerated);
  onPreviewGeneratedRef.current = onPreviewGenerated;

  // Each drawing revision owns its promise. Old exports retain their own data,
  // and late responses cannot overwrite the next revision's cache.
  const ensureFullData = useMemo(() => {
    let promise: Promise<HydratedDrawingData> | null = null;
    return (): Promise<HydratedDrawingData> => {
      promise ??= api
        .getDrawing(drawing.id)
        .then((fullDrawing) => ({
          elements: fullDrawing.elements || [],
          appState: fullDrawing.appState || {},
          files: fullDrawing.files || {},
        }))
        .catch((error) => {
          promise = null;
          throw error;
        });
      return promise;
    };
    // Version changes invalidate the cache even though the API takes only an ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id, drawing.version]);

  useEffect(() => {
    let cancelled = false;
    setPreviewSvg(normalizePreviewSvg(drawing.preview) ?? null);
    if (drawing.preview) {
      return;
    }
    if (!loadPreview) {
      return;
    }
    const generatePreview = async () => {
      // Previews are no longer inlined in list responses. Prefer the cheap,
      // ETag-cacheable per-drawing preview endpoint; only fall back to
      // client-side generation (which fetches full data) when the server has
      // no stored preview for this drawing.
      try {
        const stored = await api.getDrawingPreview(drawing.id);
        if (cancelled) return;
        if (stored) {
          setPreviewSvg(stored);
          onPreviewGeneratedRef.current?.(drawing.id, stored);
          return;
        }
      } catch {
        // An unavailable preview service does not mean the preview is absent.
        // In particular, don't amplify rate limiting with full-drawing fetches.
        return;
      }
      try {
        const data = await ensureFullData();
        if (cancelled) return;
        if (!data?.elements || !data?.appState) return;

        const { exportToSvg } = await import("@excalidraw/excalidraw");
        if (cancelled) return;

        const svg = await exportToSvg({
          elements: normalizeImageElementsForPreview(
            data.elements,
            data.files || {},
          ),
          appState: {
            ...data.appState,
            exportWithDarkMode: false,
            exportBackground: !isDefaultPreviewBackground(
              data.appState.viewBackgroundColor,
            ),
            viewBackgroundColor: data.appState.viewBackgroundColor || "#ffffff",
          },
          files: data.files || {},
          exportPadding: 10,
        });

        if (cancelled) return;
        const previewHtml = normalizePreviewSvg(svg.outerHTML) || svg.outerHTML;
        setPreviewSvg(previewHtml);
        onPreviewGeneratedRef.current?.(drawing.id, previewHtml);
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to generate preview", e);
        }
      }
    };
    generatePreview();
    return () => {
      cancelled = true;
    };
  }, [drawing.id, drawing.preview, ensureFullData, loadPreview]);

  const buildExportDrawing = useCallback(async (): Promise<Drawing> => {
    const data = await ensureFullData();
    return {
      ...drawing,
      elements: data.elements || [],
      appState: data.appState || {},
      files: data.files || {},
    };
  }, [drawing, ensureFullData]);

  return {
    previewSvg,
    hasEmbeddedImages: previewHasEmbeddedImages(previewSvg),
    buildExportDrawing,
  };
};
