import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useDashboardDrawingActions } from "./useDashboardDrawingActions";
import type { DrawingSummary } from "../../types";

vi.mock("../../api", () => ({
  setSharedDrawingHidden: vi.fn(),
}));

const makeDrawing = (id: string): DrawingSummary =>
  ({
    id,
    name: id,
    collectionId: null,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    preview: null,
  }) as DrawingSummary;

describe("useDashboardDrawingActions - hide shared", () => {
  const setSharedDrawingHiddenMock = vi.mocked(api.setSharedDrawingHidden);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = (initial: DrawingSummary[]) => {
    let drawings = initial;
    const setDrawings = vi.fn((updater: any) => {
      drawings = typeof updater === "function" ? updater(drawings) : updater;
    });
    let total = initial.length;
    const setTotalCount = vi.fn((updater: any) => {
      total = typeof updater === "function" ? updater(total) : updater;
    });
    const setSelectedIds = vi.fn();
    const refreshData = vi.fn();

    const { result } = renderHook(() =>
      useDashboardDrawingActions({
        drawings,
        setDrawings: setDrawings as any,
        collections: [],
        selectedCollectionId: "shared",
        selectedIds: new Set<string>(),
        setSelectedIds: setSelectedIds as any,
        setTotalCount: setTotalCount as any,
        uploadFiles: vi.fn(),
        refreshData,
        navigate: vi.fn() as any,
      }),
    );

    return {
      result,
      getDrawings: () => drawings,
      getTotal: () => total,
      refreshData,
    };
  };

  it("optimistically removes the drawing and calls the API with hidden=true", async () => {
    setSharedDrawingHiddenMock.mockResolvedValue({ success: true, hidden: true });
    const { result, getDrawings, getTotal } = setup([
      makeDrawing("a"),
      makeDrawing("b"),
    ]);

    await act(async () => {
      await result.current.handleHideSharedDrawing("a");
    });

    expect(getDrawings().map((d) => d.id)).toEqual(["b"]);
    expect(getTotal()).toBe(1);
    expect(setSharedDrawingHiddenMock).toHaveBeenCalledWith("a", true);
  });

  it("refreshes data when the API call fails", async () => {
    setSharedDrawingHiddenMock.mockRejectedValue(new Error("boom"));
    const { result, refreshData } = setup([makeDrawing("a")]);

    await act(async () => {
      await result.current.handleHideSharedDrawing("a");
    });

    await waitFor(() => expect(refreshData).toHaveBeenCalled());
  });
});
