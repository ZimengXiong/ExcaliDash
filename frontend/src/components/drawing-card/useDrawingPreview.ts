import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Drawing, DrawingSummary } from "../../types";
import {
  createPreviewIdScope,
  normalizeSvgElement,
  scopePreviewSvgIds,
  isDefaultPreviewBackground,
  prepareStoredPreview,
  queuePreviewFetch,
} from "../../utils/previewSvg";
import {
  isRehydratableRef,
  rehydrateFilesFromUrls,
} from "../../utils/rehydrateFiles";
import { renderPreviewSvg } from "../../utils/renderPreview";
import * as api from "../../api";
import {
  drawingPreviewGeneration,
  invalidateDrawingPreview,
  previewCacheKey,
  readExactCachedPreview,
  readLatestCachedPreview,
  subscribeToDrawingPreview,
  writeCachedPreview,
} from "./previewCache";

const isAccessLost = (error: unknown) =>
  api.isAxiosError(error) &&
  [401, 403, 404].includes(error.response?.status ?? 0);

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
  loadPreview = true,
) => {
  const cacheKey = previewCacheKey(drawing);
  const [previewSvg, setPreviewSvg] = useState<string | null>(
    () =>
      readExactCachedPreview(cacheKey) ??
      readLatestCachedPreview(drawing.id) ??
      null,
  );
  const previewRequest = useRef<AbortController | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const evicted = useRef(false);

  useLayoutEffect(() => {
    evicted.current = false;
    const unsubscribe = subscribeToDrawingPreview(drawing.id, (wasEvicted) => {
      previewRequest.current?.abort();
      if (wasEvicted) {
        evicted.current = true;
        setPreviewSvg(null);
      }
      setPreviewRevision((previous) => previous + 1);
    });
    return () => {
      previewRequest.current?.abort();
      unsubscribe();
    };
  }, [drawing.id]);

  useEffect(() => {
    if (evicted.current) return;
    const generation = drawingPreviewGeneration();
    const exactCached = readExactCachedPreview(cacheKey);
    if (exactCached !== null) {
      setPreviewSvg((prev) => (prev === exactCached ? prev : exactCached));
      return;
    }
    if (!loadPreview) return;
    const staleCached = readLatestCachedPreview(drawing.id);
    setPreviewSvg((prev) => prev ?? staleCached);
    const controller = new AbortController();
    previewRequest.current = controller;
    const { signal } = controller;
    const generatePreview = async () => {
      // Previews are no longer inlined in list responses. Prefer the cheap,
      // ETag-cacheable per-drawing preview endpoint; only fall back to
      // client-side generation (which fetches full data) when the server has
      // no stored preview for this drawing.
      try {
        const stored =
          (previewRevision === 0 && drawing.preview) ||
          (await queuePreviewFetch(signal, () =>
            api.getDrawingPreview(drawing.id, signal),
          ));
        if (signal.aborted) return;
        if (stored) {
          const prepared = await prepareStoredPreview(stored, signal);
          if (signal.aborted) return;
          if (prepared !== null) {
            if (
              writeCachedPreview(drawing.id, cacheKey, prepared, generation)
            ) {
              setPreviewSvg(prepared);
            }
            return;
          }
        }
      } catch (error) {
        if (signal.aborted) return;
        // Lost access or a deleted drawing: stop showing the cached thumbnail.
        if (isAccessLost(error)) {
          invalidateDrawingPreview(drawing.id, true);
          return;
        }
        // An unavailable preview service does not mean the preview is absent.
        // In particular, don't amplify rate limiting with full-drawing fetches.
        return;
      }
      try {
        const data = await queuePreviewFetch(signal, () =>
          api.getDrawing(drawing.id, { omitPreview: true, signal }),
        );
        if (signal.aborted) return;
        if (!data?.elements || !data?.appState) return;

        // Ignore old, unreferenced file entries. A deleted image or a failed
        // file fetch must not prevent the rest of the thumbnail from rendering.
        const fileIds = new Set(
          data.elements
            .filter((element) => element.type === "image" && !element.isDeleted)
            .map((element) => element.fileId),
        );
        const files = await rehydrateFilesFromUrls(
          Object.fromEntries(
            Object.entries(data.files || {}).filter(([fileId]) =>
              fileIds.has(fileId),
            ),
          ),
          signal,
          (fetchFile) => queuePreviewFetch(signal, fetchFile),
        );
        if (signal.aborted) return;
        const excalidraw = await import("@excalidraw/excalidraw");
        if (signal.aborted) return;

        const availableFiles = Object.fromEntries(
          Object.entries(files).filter(
            ([, file]) => !isRehydratableRef(file?.dataURL),
          ),
        );
        const preview = await renderPreviewSvg(
          excalidraw,
          {
            elements: normalizeImageElementsForPreview(
              data.elements,
              availableFiles,
            ),
            appState: {
              ...data.appState,
              exportWithDarkMode: false,
              exportBackground: !isDefaultPreviewBackground(
                data.appState.viewBackgroundColor,
              ),
              viewBackgroundColor:
                data.appState.viewBackgroundColor || "#ffffff",
            },
            files: availableFiles,
            exportPadding: 10,
          },
          normalizeSvgElement,
        );

        if (signal.aborted) return;
        if (generation !== drawingPreviewGeneration()) return;
        // A failed file fetch should not persist an incomplete preview.
        if ([...fileIds].every((id) => !id || availableFiles[id]?.dataURL)) {
          writeCachedPreview(drawing.id, cacheKey, preview, generation);
        }
        setPreviewSvg(preview);
      } catch (e) {
        if (signal.aborted) return;
        if (isAccessLost(e)) {
          invalidateDrawingPreview(drawing.id, true);
          return;
        }
        console.error("Failed to generate preview", e);
      }
    };
    generatePreview();
    return () => {
      controller.abort();
      previewRequest.current = null;
    };
  }, [cacheKey, drawing.id, drawing.preview, loadPreview, previewRevision]);

  const buildExportDrawing = useCallback(async (): Promise<Drawing> => {
    const generation = drawingPreviewGeneration();
    const data = await api.getDrawing(drawing.id, { omitPreview: true });
    if (generation !== drawingPreviewGeneration() || evicted.current) {
      throw new DOMException(
        "The drawing is no longer available",
        "AbortError",
      );
    }
    return {
      ...data,
      elements: data.elements || [],
      appState: data.appState || {},
      files: data.files || {},
    };
  }, [drawing.id]);

  // Each inline preview gets its own id namespace in the document.
  const [idScope] = useState(() => createPreviewIdScope(drawing.id));
  const scopedPreviewSvg = useMemo(
    () => (previewSvg ? scopePreviewSvgIds(previewSvg, idScope) : previewSvg),
    [idScope, previewSvg],
  );

  return {
    previewSvg: scopedPreviewSvg,
    buildExportDrawing,
  };
};
