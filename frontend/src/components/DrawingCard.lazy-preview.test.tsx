import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { DrawingCard } from "./DrawingCard";

vi.mock("../api", () => ({
  getDrawingPreview: vi.fn(),
  getDrawing: vi.fn(),
  isS3Enabled: vi.fn(),
}));

describe("DrawingCard preview loading", () => {
  let intersectionCallback: IntersectionObserverCallback;
  const observe = vi.fn();
  const disconnect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    class IntersectionObserverMock {
      readonly root = null;
      readonly rootMargin = "320px 0px";
      readonly thresholds = [0];

      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }

      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal(
      "IntersectionObserver",
      IntersectionObserverMock,
    );
  });

  it("waits until the card approaches the viewport before fetching its preview", async () => {
    vi.mocked(api.getDrawingPreview).mockResolvedValue("<svg>stored</svg>");

    render(
      <DrawingCard
        drawing={{
          id: "d1",
          name: "Deferred preview",
          collectionId: null,
          updatedAt: Date.now(),
          createdAt: Date.now(),
          version: 1,
        }}
        collections={[]}
        isSelected={false}
        isShared
        onToggleSelection={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onMoveToCollection={vi.fn()}
        onDuplicate={vi.fn()}
        onClick={vi.fn()}
      />,
    );

    expect(observe).toHaveBeenCalledTimes(1);
    expect(api.getDrawingPreview).not.toHaveBeenCalled();

    act(() => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    await waitFor(() => {
      expect(api.getDrawingPreview).toHaveBeenCalledWith("d1");
    });
    expect(disconnect).toHaveBeenCalled();
  });
});
