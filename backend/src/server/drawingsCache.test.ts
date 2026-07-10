import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDrawingsCacheStore } from "./drawingsCache";

describe("drawings cache store", () => {
  let now = 0;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds deterministic cache keys", () => {
    const { buildDrawingsCacheKey } = createDrawingsCacheStore(5000);
    const keyA = buildDrawingsCacheKey({
      userId: "u1",
      searchTerm: "roadmap",
      collectionFilter: "default",
      includeData: false,
      sortField: "updatedAt",
      sortDirection: "desc",
    });
    const keyB = buildDrawingsCacheKey({
      userId: "u1",
      searchTerm: "roadmap",
      collectionFilter: "default",
      includeData: false,
      sortField: "updatedAt",
      sortDirection: "desc",
    });
    const keyC = buildDrawingsCacheKey({
      userId: "u1",
      searchTerm: "roadmap",
      collectionFilter: "default",
      includeData: true,
      sortField: "updatedAt",
      sortDirection: "desc",
    });

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
  });

  it("caches payloads and expires by TTL", () => {
    const { cacheDrawingsResponse, getCachedDrawingsBody } = createDrawingsCacheStore(1000);
    const key = "drawings:key:1";
    const payload = { drawings: [{ id: "d1" }], totalCount: 1 };

    const body = cacheDrawingsResponse(key, payload);
    expect(body.toString("utf8")).toContain("\"totalCount\":1");

    now = 800;
    expect(getCachedDrawingsBody(key)?.toString("utf8")).toContain("\"d1\"");

    now = 1200;
    expect(getCachedDrawingsBody(key)).toBeNull();
  });

  it("supports manual invalidation", () => {
    const { cacheDrawingsResponse, getCachedDrawingsBody, invalidateDrawingsCache } =
      createDrawingsCacheStore(10_000);
    const key = "drawings:key:2";

    cacheDrawingsResponse(key, { drawings: [], totalCount: 0 });
    expect(getCachedDrawingsBody(key)).not.toBeNull();

    invalidateDrawingsCache();
    expect(getCachedDrawingsBody(key)).toBeNull();
  });

  it("scopes invalidation by userId when provided", () => {
    const { cacheDrawingsResponse, getCachedDrawingsBody, invalidateDrawingsCache } =
      createDrawingsCacheStore(10_000);

    cacheDrawingsResponse("k:u1:a", { drawings: [{ id: "a" }] }, "u1");
    cacheDrawingsResponse("k:u1:b", { drawings: [{ id: "b" }] }, "u1");
    cacheDrawingsResponse("k:u2:a", { drawings: [{ id: "c" }] }, "u2");

    invalidateDrawingsCache("u1");

    expect(getCachedDrawingsBody("k:u1:a")).toBeNull();
    expect(getCachedDrawingsBody("k:u1:b")).toBeNull();
    // Another user's entries are untouched.
    expect(getCachedDrawingsBody("k:u2:a")?.toString("utf8")).toContain("\"c\"");
  });

  it("evicts least-recently-used entries past the entry bound", () => {
    const { cacheDrawingsResponse, getCachedDrawingsBody } = createDrawingsCacheStore(
      10_000,
      { maxEntries: 2 },
    );

    cacheDrawingsResponse("e1", { v: 1 }, "u1");
    cacheDrawingsResponse("e2", { v: 2 }, "u1");
    // Touch e1 so e2 becomes the least-recently-used entry.
    expect(getCachedDrawingsBody("e1")).not.toBeNull();
    cacheDrawingsResponse("e3", { v: 3 }, "u1");

    expect(getCachedDrawingsBody("e2")).toBeNull();
    expect(getCachedDrawingsBody("e1")).not.toBeNull();
    expect(getCachedDrawingsBody("e3")).not.toBeNull();
  });

  it("skips caching oversized bodies but still returns them", () => {
    const { cacheDrawingsResponse, getCachedDrawingsBody } = createDrawingsCacheStore(
      10_000,
      { maxBodyBytes: 32 },
    );

    const bigPayload = { drawings: [{ id: "x".repeat(200) }] };
    const body = cacheDrawingsResponse("big", bigPayload, "u1");
    expect(body.byteLength).toBeGreaterThan(32);
    // Returned to the caller, but never retained.
    expect(getCachedDrawingsBody("big")).toBeNull();
  });

  it("evicts oldest entries once the total byte bound is exceeded", () => {
    const { cacheDrawingsResponse, getCachedDrawingsBody } = createDrawingsCacheStore(
      10_000,
      { maxBytes: 120, maxBodyBytes: 1000 },
    );

    // Each body is ~60-70 bytes; two fit, the third should evict the oldest.
    cacheDrawingsResponse("b1", { pad: "a".repeat(50) }, "u1");
    cacheDrawingsResponse("b2", { pad: "b".repeat(50) }, "u1");
    cacheDrawingsResponse("b3", { pad: "c".repeat(50) }, "u1");

    expect(getCachedDrawingsBody("b1")).toBeNull();
    expect(getCachedDrawingsBody("b3")).not.toBeNull();
  });
});
