import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorCollaboration } from "./useEditorCollaboration";

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    connected: true,
    on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn(),
  })),
}));

describe("editor wheel navigation while collaboration is active", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it.each([
    ["horizontal two-finger pan", { deltaX: 48, deltaY: 0 }],
    ["vertical two-finger pan", { deltaX: 0, deltaY: 16.5 }],
    ["diagonal two-finger pan", { deltaX: 12.5, deltaY: 18 }],
    ["trackpad pinch zoom", { deltaY: -8, ctrlKey: true }],
    ["command-wheel zoom", { deltaY: 24, metaKey: true }],
  ] as const)("passes %s unchanged to Excalidraw", (_name, gesture) => {
    const container = document.createElement("div");
    const canvas = document.createElement("canvas");
    container.append(canvas);
    document.body.append(container);
    const params = {
      drawingId: "gesture-regression",
      me: { id: "u1", name: "Test", initials: "TE", color: "#123456" },
      isReady: true,
      excalidrawAPI: { current: null },
      editorContainerRef: { current: container },
      lastSyncedFilesRef: { current: {} },
      lastSyncedElementOrderSigRef: { current: "" },
      latestElementsRef: { current: [] },
      latestFilesRef: { current: {} },
      computeElementOrderSig: () => "",
      recordElementVersion: vi.fn(),
      onAccessDenied: vi.fn(),
    };
    renderHook(() => useEditorCollaboration(params));
    const received: Event[] = [];
    canvas.addEventListener("wheel", (event) => received.push(event));
    const event = new WheelEvent("wheel", {
      bubbles: true, cancelable: true, deltaMode: 0, ...gesture,
    });
    canvas.dispatchEvent(event);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
