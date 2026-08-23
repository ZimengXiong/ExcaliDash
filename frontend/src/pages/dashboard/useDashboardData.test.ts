import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useDashboardData } from "./useDashboardData";

vi.mock("../../api", () => ({
  getDrawings: vi.fn(),
  getCollections: vi.fn(),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeDrawing = (id: string) => ({
  id,
  name: id,
  collectionId: null,
  createdAt: 1,
  updatedAt: 1,
  version: 1,
  preview: null,
});

const makeCollection = (id: string) => ({
  id,
  name: id,
  createdAt: 1,
});

describe("useDashboardData", () => {
  const getDrawingsMock = vi.mocked(api.getDrawings);
  const getCollectionsMock = vi.mocked(api.getCollections);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads drawings and collections on mount", async () => {
    getDrawingsMock.mockResolvedValue({
      drawings: [makeDrawing("d1")],
      totalCount: 1,
      limit: 24,
      offset: 0,
    });
    getCollectionsMock.mockResolvedValue([makeCollection("c1")]);

    const onRefreshSuccess = vi.fn();
    const { result } = renderHook(() =>
      useDashboardData({
        debouncedSearch: "",
        selectedCollectionId: undefined,
        sortField: "updatedAt",
        sortDirection: "desc",
        pageSize: 24,
        onRefreshSuccess,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getDrawingsMock).toHaveBeenCalledWith("", undefined, {
      limit: 24,
      offset: 0,
      sortField: "updatedAt",
      sortDirection: "desc",
    });
    expect(getCollectionsMock).toHaveBeenCalledTimes(1);
    expect(result.current.drawings.map((drawing) => drawing.id)).toEqual(["d1"]);
    expect(result.current.collections.map((collection) => collection.id)).toEqual(["c1"]);
    expect(result.current.totalCount).toBe(1);
    expect(onRefreshSuccess).toHaveBeenCalledTimes(1);
  });

  it("fetches more drawings and merges unique results", async () => {
    getDrawingsMock
      .mockResolvedValueOnce({
        drawings: [makeDrawing("d1"), makeDrawing("d2")],
        totalCount: 3,
        limit: 24,
        offset: 0,
      })
      .mockResolvedValueOnce({
        drawings: [makeDrawing("d2"), makeDrawing("d3")],
        totalCount: 3,
        limit: 24,
        offset: 2,
      });
    getCollectionsMock.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useDashboardData({
        debouncedSearch: "",
        selectedCollectionId: undefined,
        sortField: "updatedAt",
        sortDirection: "desc",
        pageSize: 24,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.fetchMore();
    });

    expect(getDrawingsMock).toHaveBeenNthCalledWith(2, "", undefined, {
      limit: 24,
      offset: 2,
      sortField: "updatedAt",
      sortDirection: "desc",
    });
    expect(result.current.drawings.map((drawing) => drawing.id)).toEqual(["d1", "d2", "d3"]);
    expect(result.current.hasMore).toBe(false);
  });

  it("ignores stale refresh responses from older requests", async () => {
    const firstDrawings = deferred<{
      drawings: ReturnType<typeof makeDrawing>[];
      totalCount: number;
      limit: number;
      offset: number;
    }>();
    const secondDrawings = deferred<{
      drawings: ReturnType<typeof makeDrawing>[];
      totalCount: number;
      limit: number;
      offset: number;
    }>();
    const firstCollections = deferred<ReturnType<typeof makeCollection>[]>();
    const secondCollections = deferred<ReturnType<typeof makeCollection>[]>();

    getDrawingsMock
      .mockReturnValueOnce(firstDrawings.promise as ReturnType<typeof api.getDrawings>)
      .mockReturnValueOnce(secondDrawings.promise as ReturnType<typeof api.getDrawings>);
    getCollectionsMock
      .mockReturnValueOnce(firstCollections.promise as ReturnType<typeof api.getCollections>)
      .mockReturnValueOnce(secondCollections.promise as ReturnType<typeof api.getCollections>);

    const { result, rerender } = renderHook(
      (search: string) =>
        useDashboardData({
          debouncedSearch: search,
          selectedCollectionId: undefined,
          sortField: "updatedAt",
          sortDirection: "desc",
          pageSize: 24,
        }),
      { initialProps: "first" }
    );

    rerender("second");

    await act(async () => {
      secondDrawings.resolve({
        drawings: [makeDrawing("new")],
        totalCount: 1,
        limit: 24,
        offset: 0,
      });
      secondCollections.resolve([makeCollection("new-collection")]);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.drawings.map((drawing) => drawing.id)).toEqual(["new"]);
    });

    await act(async () => {
      firstDrawings.resolve({
        drawings: [makeDrawing("old")],
        totalCount: 1,
        limit: 24,
        offset: 0,
      });
      firstCollections.resolve([makeCollection("old-collection")]);
      await Promise.resolve();
    });

    expect(result.current.drawings.map((drawing) => drawing.id)).toEqual(["new"]);
    expect(result.current.collections.map((collection) => collection.id)).toEqual([
      "new-collection",
    ]);
  });

  it("drops deleted shared collections after refresh", async () => {
    getDrawingsMock.mockResolvedValue({
      drawings: [makeDrawing("d1")],
      totalCount: 1,
      limit: 24,
      offset: 0,
    });
    getCollectionsMock
      .mockResolvedValueOnce([makeCollection("shared-a"), makeCollection("shared-b")])
      .mockResolvedValueOnce([makeCollection("shared-a")]);

    const { result } = renderHook(() =>
      useDashboardData({
        debouncedSearch: "",
        selectedCollectionId: undefined,
        sortField: "updatedAt",
        sortDirection: "desc",
        pageSize: 24,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.collections.map((collection) => collection.id)).toEqual([
      "shared-a",
      "shared-b",
    ]);

    await act(async () => {
      await result.current.refreshData();
    });

    expect(result.current.collections.map((collection) => collection.id)).toEqual([
      "shared-a",
    ]);
  });
});
