type DrawingsCacheEntry = {
  body: Buffer;
  expiresAt: number;
  userId: string;
  bytes: number;
};

export type DrawingsCacheKeyParts = {
  userId: string;
  searchTerm: string;
  collectionFilter: string;
  includeData: boolean;
  sortField: "name" | "createdAt" | "updatedAt";
  sortDirection: "asc" | "desc";
};

export type DrawingsCacheOptions = {
  // Maximum number of cached list responses retained at once.
  maxEntries?: number;
  // Maximum total size (bytes) of all cached bodies combined.
  maxBytes?: number;
  // Bodies larger than this are served but never stored (OOM guard).
  maxBodyBytes?: number;
};

export const createDrawingsCacheStore = (
  ttlMs: number,
  options: DrawingsCacheOptions = {},
) => {
  const maxEntries = options.maxEntries ?? 500;
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  const maxBodyBytes = options.maxBodyBytes ?? 4 * 1024 * 1024;

  // Map preserves insertion order; we treat least-recently-used as the oldest
  // key and refresh recency by re-inserting on read/write.
  const drawingsCache = new Map<string, DrawingsCacheEntry>();
  let totalBytes = 0;

  const dropEntry = (key: string, entry: DrawingsCacheEntry) => {
    drawingsCache.delete(key);
    totalBytes -= entry.bytes;
  };

  const evictToBounds = () => {
    // Evict oldest (front of the Map) until within both bounds.
    while (
      drawingsCache.size > maxEntries ||
      (totalBytes > maxBytes && drawingsCache.size > 0)
    ) {
      const oldest = drawingsCache.keys().next();
      if (oldest.done) break;
      const entry = drawingsCache.get(oldest.value);
      if (!entry) {
        drawingsCache.delete(oldest.value);
        continue;
      }
      dropEntry(oldest.value, entry);
    }
  };

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
      dropEntry(key, entry);
      return null;
    }
    // Refresh LRU recency: re-insert so the key moves to the newest position.
    drawingsCache.delete(key);
    drawingsCache.set(key, entry);
    return entry.body;
  };

  const cacheDrawingsResponse = (
    key: string,
    payload: unknown,
    userId = "",
  ): Buffer => {
    const body = Buffer.from(JSON.stringify(payload));
    const bytes = body.byteLength;

    // Never retain oversized bodies: serve them but keep them out of the cache
    // so a single huge response can't pin the store near its byte ceiling.
    if (bytes > maxBodyBytes) {
      const existing = drawingsCache.get(key);
      if (existing) dropEntry(key, existing);
      return body;
    }

    const existing = drawingsCache.get(key);
    if (existing) dropEntry(key, existing);

    drawingsCache.set(key, {
      body,
      bytes,
      userId,
      expiresAt: Date.now() + ttlMs,
    });
    totalBytes += bytes;
    evictToBounds();
    return body;
  };

  // Called with no argument on writes that may affect any user's list (imports,
  // legacy paths). Called with a userId to scope invalidation to a single owner.
  const invalidateDrawingsCache = (userId?: string) => {
    if (!userId) {
      drawingsCache.clear();
      totalBytes = 0;
      return;
    }
    for (const [key, entry] of drawingsCache.entries()) {
      if (entry.userId === userId) dropEntry(key, entry);
    }
  };

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of drawingsCache.entries()) {
      if (now > entry.expiresAt) dropEntry(key, entry);
    }
  }, 60_000).unref();

  return {
    buildDrawingsCacheKey,
    getCachedDrawingsBody,
    cacheDrawingsResponse,
    invalidateDrawingsCache,
  };
};
