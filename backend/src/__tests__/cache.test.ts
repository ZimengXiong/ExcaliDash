/**
 * Tests for utils/cache.ts
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  buildDrawingsCacheKey,
  getCachedDrawingsBody,
  cacheDrawingsResponse,
  invalidateDrawingsCache,
  startCacheCleanup,
  DRAWINGS_CACHE_TTL_MS,
} from "../utils/cache";

describe("buildDrawingsCacheKey", () => {
  it("should build key with empty search and default collection", () => {
    const key = buildDrawingsCacheKey({
      searchTerm: "",
      collectionFilter: "default",
      includeData: false,
    });
    expect(key).toBe(JSON.stringify(["", "default", "summary"]));
  });

  it("should build key with search term", () => {
    const key = buildDrawingsCacheKey({
      searchTerm: "test search",
      collectionFilter: "default",
      includeData: false,
    });
    expect(key).toBe(JSON.stringify(["test search", "default", "summary"]));
  });

  it("should build key with collection filter", () => {
    const key = buildDrawingsCacheKey({
      searchTerm: "",
      collectionFilter: "id:collection-123",
      includeData: false,
    });
    expect(key).toBe(JSON.stringify(["", "id:collection-123", "summary"]));
  });

  it("should build key with null collection filter", () => {
    const key = buildDrawingsCacheKey({
      searchTerm: "",
      collectionFilter: "null",
      includeData: false,
    });
    expect(key).toBe(JSON.stringify(["", "null", "summary"]));
  });

  it("should build key with includeData true", () => {
    const key = buildDrawingsCacheKey({
      searchTerm: "",
      collectionFilter: "default",
      includeData: true,
    });
    expect(key).toBe(JSON.stringify(["", "default", "full"]));
  });

  it("should produce unique keys for different inputs", () => {
    const key1 = buildDrawingsCacheKey({
      searchTerm: "a",
      collectionFilter: "default",
      includeData: false,
    });
    const key2 = buildDrawingsCacheKey({
      searchTerm: "b",
      collectionFilter: "default",
      includeData: false,
    });
    const key3 = buildDrawingsCacheKey({
      searchTerm: "a",
      collectionFilter: "other",
      includeData: false,
    });
    const key4 = buildDrawingsCacheKey({
      searchTerm: "a",
      collectionFilter: "default",
      includeData: true,
    });

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).not.toBe(key4);
  });
});

describe("Cache Operations", () => {
  beforeEach(() => {
    invalidateDrawingsCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getCachedDrawingsBody", () => {
    it("should return null for non-existent key", () => {
      const result = getCachedDrawingsBody("non-existent-key");
      expect(result).toBeNull();
    });

    it("should return cached data for valid key", () => {
      const key = "test-key";
      const data = { drawings: [{ id: "1" }] };
      cacheDrawingsResponse(key, data);

      const result = getCachedDrawingsBody(key);
      expect(result).not.toBeNull();
      expect(JSON.parse(result!.toString())).toEqual(data);
    });

    it("should return null for expired cache entry", () => {
      const key = "expiring-key";
      const data = { test: true };
      cacheDrawingsResponse(key, data);

      // Advance time past TTL
      vi.advanceTimersByTime(DRAWINGS_CACHE_TTL_MS + 1000);

      const result = getCachedDrawingsBody(key);
      expect(result).toBeNull();
    });

    it("should return data before TTL expires", () => {
      const key = "valid-key";
      const data = { valid: true };
      cacheDrawingsResponse(key, data);

      // Advance time but not past TTL
      vi.advanceTimersByTime(DRAWINGS_CACHE_TTL_MS - 1000);

      const result = getCachedDrawingsBody(key);
      expect(result).not.toBeNull();
    });
  });

  describe("cacheDrawingsResponse", () => {
    it("should cache data and return buffer", () => {
      const key = "cache-test";
      const data = { test: "value" };

      const buffer = cacheDrawingsResponse(key, data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(JSON.parse(buffer.toString())).toEqual(data);
    });

    it("should overwrite existing cache entry", () => {
      const key = "overwrite-test";
      const data1 = { version: 1 };
      const data2 = { version: 2 };

      cacheDrawingsResponse(key, data1);
      cacheDrawingsResponse(key, data2);

      const result = getCachedDrawingsBody(key);
      expect(JSON.parse(result!.toString())).toEqual(data2);
    });

    it("should handle complex nested data", () => {
      const key = "complex-test";
      const data = {
        drawings: [
          { id: "1", elements: [{ type: "rect" }], appState: { zoom: 1 } },
          { id: "2", elements: [], appState: {} },
        ],
        meta: { total: 2 },
      };

      cacheDrawingsResponse(key, data);
      const result = getCachedDrawingsBody(key);
      expect(JSON.parse(result!.toString())).toEqual(data);
    });

    it("should handle empty arrays and objects", () => {
      const key = "empty-test";
      const data = { array: [], object: {}, null: null };

      cacheDrawingsResponse(key, data);
      const result = getCachedDrawingsBody(key);
      expect(JSON.parse(result!.toString())).toEqual(data);
    });
  });

  describe("invalidateDrawingsCache", () => {
    it("should clear all cached entries", () => {
      cacheDrawingsResponse("key1", { a: 1 });
      cacheDrawingsResponse("key2", { b: 2 });
      cacheDrawingsResponse("key3", { c: 3 });

      invalidateDrawingsCache();

      expect(getCachedDrawingsBody("key1")).toBeNull();
      expect(getCachedDrawingsBody("key2")).toBeNull();
      expect(getCachedDrawingsBody("key3")).toBeNull();
    });

    it("should be safe to call multiple times", () => {
      cacheDrawingsResponse("key", { test: true });

      invalidateDrawingsCache();
      invalidateDrawingsCache();
      invalidateDrawingsCache();

      expect(getCachedDrawingsBody("key")).toBeNull();
    });

    it("should be safe to call on empty cache", () => {
      expect(() => invalidateDrawingsCache()).not.toThrow();
    });
  });

  describe("startCacheCleanup", () => {
    it("should return interval id", () => {
      const intervalId = startCacheCleanup();
      expect(intervalId).toBeDefined();
      clearInterval(intervalId);
    });

    it("should clean up expired entries periodically", () => {
      const key1 = "cleanup-key1";

      cacheDrawingsResponse(key1, { first: true });

      // Advance past TTL so the entry expires
      vi.advanceTimersByTime(DRAWINGS_CACHE_TTL_MS + 1000);

      // Start cleanup and trigger cleanup interval (60 seconds)
      const intervalId = startCacheCleanup();
      vi.advanceTimersByTime(60000);

      // Entry should be cleaned up by the interval
      expect(getCachedDrawingsBody(key1)).toBeNull();

      clearInterval(intervalId);
    });
  });
});

describe("DRAWINGS_CACHE_TTL_MS", () => {
  it("should be a positive number", () => {
    expect(DRAWINGS_CACHE_TTL_MS).toBeGreaterThan(0);
  });

  it("should be the default value (5000ms) when env not set", () => {
    // Default is 5000ms unless DRAWINGS_CACHE_TTL_MS env var is set
    expect(DRAWINGS_CACHE_TTL_MS).toBe(5000);
  });
});
