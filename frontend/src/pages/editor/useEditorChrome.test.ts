import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorChrome } from "./useEditorChrome";

vi.mock("lodash/throttle", () => ({
  default: (fn: (...args: unknown[]) => unknown) => fn,
}));

describe("useEditorChrome", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.title = "Original Title";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates document title and restores app title on unmount", () => {
    const { rerender, unmount } = renderHook(
      ({ drawingName }) =>
        useEditorChrome({
          drawingName,
          autoHideEnabled: false,
          isRenaming: false,
        }),
      { initialProps: { drawingName: "Roadmap" } },
    );

    expect(document.title).toBe("Roadmap - ExcaliDash");

    rerender({ drawingName: "Architecture" });
    expect(document.title).toBe("Architecture - ExcaliDash");

    unmount();
    expect(document.title).toBe("ExcaliDash");
  });

  it("keeps header visible when auto-hide is disabled", () => {
    const { result } = renderHook(() =>
      useEditorChrome({
        drawingName: "Test",
        autoHideEnabled: false,
        isRenaming: false,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.isHeaderVisible).toBe(true);
  });

  it("auto-hides header after inactivity timeout", () => {
    const { result } = renderHook(() =>
      useEditorChrome({
        drawingName: "Test",
        autoHideEnabled: true,
        isRenaming: false,
      }),
    );

    expect(result.current.isHeaderVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3001);
    });

    expect(result.current.isHeaderVisible).toBe(false);
  });

  it("shows header in trigger zone and hides it again after leaving", () => {
    const { result } = renderHook(() =>
      useEditorChrome({
        drawingName: "Test",
        autoHideEnabled: true,
        isRenaming: false,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(3001);
    });
    expect(result.current.isHeaderVisible).toBe(false);

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 0 }));
    });
    expect(result.current.isHeaderVisible).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 40 }));
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.isHeaderVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isHeaderVisible).toBe(false);
  });
});
