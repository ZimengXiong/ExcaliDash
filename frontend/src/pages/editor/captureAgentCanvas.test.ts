import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportToBlob } from "@excalidraw/excalidraw";
import { captureAgentCanvas } from "./captureAgentCanvas";

vi.mock("@excalidraw/excalidraw", () => ({ exportToBlob: vi.fn() }));

const exportMock = vi.mocked(exportToBlob);

describe("captureAgentCanvas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports a valid blank canvas without attempting image export", async () => {
    const result = await captureAgentCanvas({
      getSceneElements: () => [],
    });
    expect(result).toEqual({ state: "blank" });
    expect(exportMock).not.toHaveBeenCalled();
  });

  it("reports unavailable when no editor API exists", async () => {
    await expect(captureAgentCanvas(null)).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("returns a transient PNG for a nonblank canvas", async () => {
    exportMock.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    const result = await captureAgentCanvas({
      getSceneElements: () => [{ id: "shape-1", isDeleted: false }],
      getAppState: () => ({ viewBackgroundColor: "#fff" }),
      getFiles: () => ({}),
    });
    expect(result.state).toBe("captured");
    expect(result.imageDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
