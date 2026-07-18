import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DrawingSummary } from "../../types";
import { useDashboardSelection } from "./useDashboardSelection";

const drawing = (id: string) => ({ id }) as DrawingSummary;

describe("useDashboardSelection", () => {
  it("selects the latest dashboard results with the select-all shortcut", () => {
    const setSelectedIds = vi.fn();
    const searchInputRef = { current: null };
    const { rerender } = renderHook(
      ({ drawings }) =>
        useDashboardSelection({
          drawings,
          selectedIds: new Set(),
          setSelectedIds,
          searchInputRef,
        }),
      { initialProps: { drawings: [drawing("first")] } },
    );

    rerender({ drawings: [drawing("second"), drawing("third")] });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", ctrlKey: true }),
      );
    });

    expect(setSelectedIds).toHaveBeenLastCalledWith(
      new Set(["second", "third"]),
    );
  });
});
