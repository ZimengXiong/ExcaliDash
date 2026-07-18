import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorTextNormalization } from "./useEditorTextNormalization";

describe("useEditorTextNormalization", () => {
  let rafCallback: FrameRequestCallback | null;
  let loadingDone: (() => void) | null;

  beforeEach(() => {
    rafCallback = null;
    loadingDone = null;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafCallback = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        addEventListener: vi.fn((_event: string, callback: () => void) => {
          loadingDone = callback;
        }),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remeasures the live scene after fonts load without adding an undo step", async () => {
    const current = [{ id: "t1", type: "text", width: 80, version: 1 }];
    const normalized = [{ ...current[0], width: 120 }];
    const isSyncing = { current: false };
    const updateScene = vi.fn(() => {
      expect(isSyncing.current).toBe(true);
    });
    const args = {
      isReady: true,
      excalidrawAPI: {
        current: {
          getSceneElementsIncludingDeleted: () => current,
          updateScene,
        },
      },
      isSyncing,
      latestElementsRef: { current: current as readonly any[] },
      normalizeTextElementDimensions: vi.fn(() => normalized),
      recordElementVersion: vi.fn(),
    };

    renderHook(() => useEditorTextNormalization(args));
    await act(async () => Promise.resolve());
    act(() => rafCallback?.(0));

    expect(updateScene).toHaveBeenCalledWith({
      elements: normalized,
      captureUpdate: "NEVER",
    });
    expect(args.latestElementsRef.current).toBe(normalized);
    expect(args.recordElementVersion).toHaveBeenCalledWith(normalized[0]);
    expect(isSyncing.current).toBe(false);

    // A later dynamically-loaded font also schedules another repair.
    act(() => loadingDone?.());
    expect(rafCallback).not.toBeNull();
  });
});
