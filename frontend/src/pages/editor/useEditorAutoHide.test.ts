import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorAutoHide } from "./useEditorAutoHide";

describe("useEditorAutoHide", () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
      },
    });
  });

  it("disables auto-hide by default", () => {
    const { result } = renderHook(() => useEditorAutoHide("drawing-1"));

    expect(result.current.autoHideEnabled).toBe(false);
  });

  it("keeps an explicitly enabled preference", () => {
    window.localStorage.setItem(
      "excalidash:editor:drawing-1:autoHideEnabled",
      "1",
    );
    const { result } = renderHook(() => useEditorAutoHide("drawing-1"));

    expect(result.current.autoHideEnabled).toBe(true);

    act(() => {
      result.current.setAutoHideEnabled(false);
    });
    expect(
      window.localStorage.getItem("excalidash:editor:drawing-1:autoHideEnabled"),
    ).toBe("0");
  });
});
