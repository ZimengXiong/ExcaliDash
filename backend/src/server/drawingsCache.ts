type DrawingsCacheEntry = { body: Buffer; expiresAt: number };

export type DrawingsCacheKeyParts = {
  userId: string;
  searchTerm: string;
  collectionFilter: string;
  includeData: boolean;
  sortField: "name" | "createdAt" | "updatedAt";
  sortDirection: "asc" | "desc";
};

export const createDrawingsCacheStore = (ttlMs: number) => {
  const drawingsCache = new Map<string, DrawingsCacheEntry>();

  const buildDrawingsCacheKey = (keyParts: DrawingsCacheKeyParts) =>
    JSON.stringify([
      keyParts.userId,
      keyParts.searchTerm,
      keyParts.collectionFilter,
      keyParts.includeData ? "full" : "summary",
      keyParts.sortField,
      keyParts.sortDirection,
    ]);

  const getCachedDrawingsBody = (key: string): Buffer | null => {
    const entry = drawingsCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      drawingsCache.delete(key);
      return null;
    }
    return entry.body;
  };

  const cacheDrawingsResponse = (key: string, payload: unknown): Buffer => {
    const body = Buffer.from(JSON.stringify(payload));
    drawingsCache.set(key, {
      body,
      expiresAt: Date.now() + ttlMs,
    });
    return body;
  };

  const invalidateDrawingsCache = () => {
    drawingsCache.clear();
  };

  const invalidateDrawingsCacheForUser = (userId: string) => {
    const prefix = `["${userId}",`;
    for (const key of drawingsCache.keys()) {
      if (key.startsWith(prefix)) {
        drawingsCache.delete(key);
      }
    }
  };

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of drawingsCache.entries()) {
      if (now > entry.expiresAt) {
        drawingsCache.delete(key);
      }
    }
  }, 60_000).unref();

  return {
    buildDrawingsCacheKey,
    getCachedDrawingsBody,
    cacheDrawingsResponse,
    invalidateDrawingsCache,
    invalidateDrawingsCacheForUser,
  };
};
