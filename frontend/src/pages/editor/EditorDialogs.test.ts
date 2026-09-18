import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "NEVER" },
}));

import { getHistoryPreviewAppState } from "./historyPreview";

describe("getHistoryPreviewAppState", () => {
  it("omits snapshot collaborators instead of overwriting Excalidraw's runtime Map", () => {
    const collaborators = { stale: "serialized value" };
    const appState = {
      viewBackgroundColor: "#abc123",
      zoom: { value: 1.5 },
      collaborators,
    };

    const previewAppState = getHistoryPreviewAppState(appState);

    expect(previewAppState).toEqual({
      viewBackgroundColor: "#abc123",
      zoom: { value: 1.5 },
    });
    expect("collaborators" in previewAppState).toBe(false);
    expect(appState.collaborators).toBe(collaborators);
  });

  it("handles snapshots without app state", () => {
    expect(getHistoryPreviewAppState(null)).toEqual({});
    expect(getHistoryPreviewAppState(undefined)).toEqual({});
  });
});
