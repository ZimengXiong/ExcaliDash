import { useCallback, useEffect, useRef, useState } from "react";
import type { Drawing, DrawingSummary } from "../../types";
import { previewHasEmbeddedImages } from "../../utils/previewSvg";
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
) => {
  const [previewSvg, setPreviewSvg] = useState<string | null>(
    drawing.preview ?? null,
  );
  const [fullData, setFullData] = useState<HydratedDrawingData | null>(null);

  const fullDataRef = useRef(fullData);
  fullDataRef.current = fullData;

  const fullDataPromiseRef = useRef<Promise<HydratedDrawingData> | null>(null);
  const drawingIdRef = useRef(drawing.id);
  drawingIdRef.current = drawing.id;

  useEffect(() => {
    setFullData(null);
    fullDataPromiseRef.current = null;
  }, [drawing.id]);

  const ensureFullData = useCallback(async (): Promise<HydratedDrawingData> => {
    if (fullDataRef.current) {
      return fullDataRef.current;
    }
    if (fullDataPromiseRef.current) {
      return fullDataPromiseRef.current;
    }
    const currentDrawingId = drawingIdRef.current;
    const promise = api
      .getDrawing(currentDrawingId)
      .then((fullDrawing) => {
        const payload: HydratedDrawingData = {
          elements: fullDrawing.elements || [],
          appState: fullDrawing.appState || {},
          files: fullDrawing.files || {},
        };
        setFullData(payload);
        fullDataPromiseRef.current = null;
        return payload;
      })
      .catch((error) => {
        fullDataPromiseRef.current = null;
        throw error;
      });
    fullDataPromiseRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (drawing.preview) {
      setPreviewSvg(drawing.preview);
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
          onPreviewGenerated?.(drawing.id, stored);
          return;
        }
      } catch (e) {
        if (cancelled) return;
        // Ignore and fall through to client-side generation below.
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
            exportBackground: true,
            viewBackgroundColor: data.appState.viewBackgroundColor || "#ffffff",
          },
          files: data.files || {},
          exportPadding: 10,
        });

        if (cancelled) return;
        const previewHtml = svg.outerHTML;
        setPreviewSvg(previewHtml);
        onPreviewGenerated?.(drawing.id, previewHtml);
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
  }, [drawing.id, drawing.preview, ensureFullData, onPreviewGenerated]);

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
