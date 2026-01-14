/**
 * Drawings cache utilities
 * Extracts cache logic from the main index.ts
 */

export const DRAWINGS_CACHE_TTL_MS = (() => {
  const parsed = Number(process.env.DRAWINGS_CACHE_TTL_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5_000;
  }
  return parsed;
})();

type DrawingsCacheEntry = { body: Buffer; expiresAt: number };
const drawingsCache = new Map<string, DrawingsCacheEntry>();

export const buildDrawingsCacheKey = (keyParts: {
  searchTerm: string;
  collectionFilter: string;
  includeData: boolean;
}) =>
  JSON.stringify([
    keyParts.searchTerm,
    keyParts.collectionFilter,
    keyParts.includeData ? "full" : "summary",
  ]);

export const getCachedDrawingsBody = (key: string): Buffer | null => {
  const entry = drawingsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    drawingsCache.delete(key);
    return null;
  }
  return entry.body;
};

export const cacheDrawingsResponse = (key: string, payload: any): Buffer => {
  const body = Buffer.from(JSON.stringify(payload));
  drawingsCache.set(key, {
    body,
    expiresAt: Date.now() + DRAWINGS_CACHE_TTL_MS,
  });
  return body;
};

export const invalidateDrawingsCache = () => {
  drawingsCache.clear();
};

/**
 * Periodic cleanup of expired cache entries
 * Call this once during app initialization
 */
export const startCacheCleanup = () => {
  const intervalId = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of drawingsCache.entries()) {
      if (now > entry.expiresAt) {
        drawingsCache.delete(key);
      }
    }
  }, 60_000);
  intervalId.unref();
  return intervalId;
};
