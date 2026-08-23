import { act, render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
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

  it("defers network work until preview loading is enabled", async () => {
    getDrawingPreviewMock.mockResolvedValue("<svg>stored</svg>");

    const { result, rerender } = renderHook(
      ({ loadPreview }) =>
        useDrawingPreview(makeSummary(), undefined, loadPreview),
      { initialProps: { loadPreview: false } },
    );

    expect(result.current.previewSvg).toBeNull();
    expect(getDrawingPreviewMock).not.toHaveBeenCalled();
    expect(getDrawingMock).not.toHaveBeenCalled();

    rerender({ loadPreview: true });

    await waitFor(() => {
      expect(result.current.previewSvg).toBe("<svg>stored</svg>");
    });
    expect(getDrawingPreviewMock).toHaveBeenCalledTimes(1);
    expect(getDrawingPreviewMock).toHaveBeenCalledWith("d1");
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

  it("does not restart sibling requests when their parent rerenders", async () => {
    let resolveFirst!: (preview: string) => void;
    let resolveSecond!: (preview: string) => void;
    const firstPreview = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPreview = new Promise<string>((resolve) => {
      resolveSecond = resolve;
    });
    getDrawingPreviewMock.mockImplementation((id) =>
      id === "d1" ? firstPreview : secondPreview,
    );

    const PreviewCard = ({ id, tick }: { id: string; tick: number }) => {
      const { previewSvg } = useDrawingPreview(
        makeSummary({ id }),
        () => void tick,
      );
      return React.createElement("span", null, previewSvg);
    };
    const PreviewGrid = ({ tick }: { tick: number }) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(PreviewCard, { id: "d1", tick }),
        React.createElement(PreviewCard, { id: "d2", tick }),
      );

    const { rerender } = render(React.createElement(PreviewGrid, { tick: 0 }));
    await waitFor(() => expect(getDrawingPreviewMock).toHaveBeenCalledTimes(2));

    rerender(React.createElement(PreviewGrid, { tick: 1 }));
    expect(getDrawingPreviewMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveFirst("<svg>first</svg>");
      resolveSecond("<svg>second</svg>");
      await Promise.all([firstPreview, secondPreview]);
    });
  });
});
