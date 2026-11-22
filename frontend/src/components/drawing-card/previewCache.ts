import type { DrawingSummary } from "../../types";

const MAX_CACHED_PREVIEWS = 120;
const exactPreviewCache = new Map<string, string>();
const latestPreviewById = new Map<string, string>();
const previewListeners = new Map<string, Set<(evicted: boolean) => void>>();
let generation = 0;

export const drawingPreviewGeneration = () => generation;

export const previewCacheKey = (drawing: DrawingSummary): string =>
  `${drawing.id}:${drawing.version ?? 0}:${drawing.updatedAt ?? ""}:${drawing.preview ? drawing.preview.length : 0}`;

export const readExactCachedPreview = (key: string): string | null => {
  const cached = exactPreviewCache.get(key);
  if (cached === undefined) return null;
  exactPreviewCache.delete(key);
  exactPreviewCache.set(key, cached);
  return cached;
};

export const readLatestCachedPreview = (drawingId: string): string | null =>
  latestPreviewById.get(drawingId) ?? null;

export const writeCachedPreview = (
  drawingId: string,
  key: string,
  svg: string,
  started: number,
): boolean => {
  if (started !== generation) return false;
  exactPreviewCache.delete(key);
  exactPreviewCache.set(key, svg);
  if (exactPreviewCache.size > MAX_CACHED_PREVIEWS) {
    const oldestKey = exactPreviewCache.keys().next().value;
    if (oldestKey !== undefined) exactPreviewCache.delete(oldestKey);
  }
  latestPreviewById.delete(drawingId);
  latestPreviewById.set(drawingId, svg);
  if (latestPreviewById.size > MAX_CACHED_PREVIEWS) {
    const oldestId = latestPreviewById.keys().next().value;
    if (oldestId !== undefined) latestPreviewById.delete(oldestId);
  }
  return true;
};

export const hasCachedDrawingPreview = (drawingId: string): boolean =>
  latestPreviewById.has(drawingId);

export const subscribeToDrawingPreview = (
  id: string,
  listener: (evicted: boolean) => void,
) => {
  const listeners = previewListeners.get(id) ?? new Set();
  previewListeners.set(id, listeners);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) previewListeners.delete(id);
  };
};

export const invalidateDrawingPreview = (id: string, evicted = false) => {
  for (const key of exactPreviewCache.keys()) {
    if (key.startsWith(`${id}:`)) exactPreviewCache.delete(key);
  }
  if (evicted) latestPreviewById.delete(id);
  previewListeners.get(id)?.forEach((listener) => listener(evicted));
};

export const clearDrawingPreviewCache = (): void => {
  generation++;
  exactPreviewCache.clear();
  latestPreviewById.clear();
  for (const listeners of previewListeners.values()) {
    listeners.forEach((listener) => listener(true));
  }
};
