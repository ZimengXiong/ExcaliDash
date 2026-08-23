import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useDrawingPreview } from "./useDrawingPreview";
import type { DrawingSummary } from "../../types";

vi.mock("../../api", () => ({
  getDrawingPreview: vi.fn(),
  getDrawing: vi.fn(),
}));

const makeSummary = (overrides: Partial<DrawingSummary> = {}): DrawingSummary => ({
  id: "d1",
  name: "Test",
  collectionId: null,
  updatedAt: 1,
  createdAt: 1,
  version: 1,
  ...overrides,
});

describe("useDrawingPreview", () => {
  const getDrawingPreviewMock = vi.mocked(api.getDrawingPreview);
  const getDrawingMock = vi.mocked(api.getDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the stored preview from the per-drawing endpoint when not inlined", async () => {
    getDrawingPreviewMock.mockResolvedValue("<svg>stored</svg>");
    const onPreviewGenerated = vi.fn();

    const { result } = renderHook(() =>
      useDrawingPreview(makeSummary(), onPreviewGenerated),
    );

    await waitFor(() => {
      expect(result.current.previewSvg).toBe("<svg>stored</svg>");
    });
    expect(getDrawingPreviewMock).toHaveBeenCalledWith("d1");
    // Stored preview must never trigger the expensive full-data fetch.
    expect(getDrawingMock).not.toHaveBeenCalled();
    // Propagated to the parent so the drag preview / cache stays populated.
    expect(onPreviewGenerated).toHaveBeenCalledWith("d1", "<svg>stored</svg>");
  });

  it("uses an inlined preview without hitting the network", async () => {
    const { result } = renderHook(() =>
      useDrawingPreview(makeSummary({ preview: "<svg>inline</svg>" })),
    );

    await waitFor(() => {
      expect(result.current.previewSvg).toBe("<svg>inline</svg>");
    });
    expect(getDrawingPreviewMock).not.toHaveBeenCalled();
    expect(getDrawingMock).not.toHaveBeenCalled();
  });

  it("falls back to full-data fetch when there is no stored preview", async () => {
    getDrawingPreviewMock.mockResolvedValue(null);
    getDrawingMock.mockResolvedValue({
      id: "d1",
      elements: [],
      appState: {},
      files: {},
    } as any);

    renderHook(() => useDrawingPreview(makeSummary()));

    await waitFor(() => {
      expect(getDrawingMock).toHaveBeenCalledWith("d1");
    });
  });
});
