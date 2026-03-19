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

  it("invalidates only the target user's cache entries", () => {
    const {
      buildDrawingsCacheKey,
      cacheDrawingsResponse,
      getCachedDrawingsBody,
      invalidateDrawingsCacheForUser,
    } = createDrawingsCacheStore(10_000);

    const keyUser1 = buildDrawingsCacheKey({
      userId: "user-1",
      searchTerm: "",
      collectionFilter: "default",
      includeData: false,
      sortField: "updatedAt",
      sortDirection: "desc",
    });
    const keyUser2 = buildDrawingsCacheKey({
      userId: "user-2",
      searchTerm: "",
      collectionFilter: "default",
      includeData: false,
      sortField: "updatedAt",
      sortDirection: "desc",
    });

    cacheDrawingsResponse(keyUser1, { drawings: [{ id: "d1" }], totalCount: 1 });
    cacheDrawingsResponse(keyUser2, { drawings: [{ id: "d2" }], totalCount: 1 });

    invalidateDrawingsCacheForUser("user-1");

    expect(getCachedDrawingsBody(keyUser1)).toBeNull();
    expect(getCachedDrawingsBody(keyUser2)).not.toBeNull();
  });
});
