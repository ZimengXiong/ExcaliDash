import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { HistoryPanel } from "./HistoryPanel";

vi.mock("../api", () => ({
  getDrawingHistory: vi.fn().mockResolvedValue({
    snapshots: [],
    totalCount: 0,
  }),
  getDrawingSnapshot: vi.fn(),
}));

describe("HistoryPanel", () => {
  it("floats over the canvas and dismisses without reserving sidebar space", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <HistoryPanel
        drawingId="drawing-1"
        getCurrentVersion={() => 1}
        isOpen
        onClose={onClose}
        onRestore={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.getByText("Version history")).toBeInTheDocument();
    expect(document.querySelector(".backdrop-blur-sm")).not.toBeInTheDocument();
    expect(document.querySelector(".ui-side-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Version history" })).toHaveClass(
      "fixed",
      "w-[min(360px,calc(100vw-24px))]",
    );

    fireEvent.click(screen.getByTestId("history-dismiss-layer"));
    expect(onClose).toHaveBeenCalledOnce();
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => {
      expect(api.getDrawingHistory).toHaveBeenCalledWith("drawing-1", {
        limit: 100,
      });
    });
  });

  it("lets canvas pointer events through while previewing a snapshot", async () => {
    vi.mocked(api.getDrawingHistory).mockResolvedValueOnce({
      snapshots: [
        {
          id: "snapshot-1",
          version: 3,
          createdAt: "2026-07-28T06:45:11.000Z",
        },
      ],
      totalCount: 1,
    });
    vi.mocked(api.getDrawingSnapshot).mockResolvedValueOnce({
      id: "snapshot-1",
      drawingId: "drawing-1",
      version: 3,
      createdAt: "2026-07-28T06:45:11.000Z",
      elements: [],
      appState: {},
      files: {},
    });

    render(
      <HistoryPanel
        drawingId="drawing-1"
        getCurrentVersion={() => 3}
        isOpen
        onClose={vi.fn()}
        onRestore={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText("Version 3"));

    await waitFor(() => {
      expect(screen.getByTestId("history-dismiss-layer")).toHaveClass(
        "pointer-events-none",
      );
    });
  });

  it("keeps the canvas dismiss layer active when a preview fails to load", async () => {
    const onPreview = vi.fn();
    vi.mocked(api.getDrawingHistory).mockResolvedValueOnce({
      snapshots: [
        {
          id: "snapshot-2",
          version: 4,
          createdAt: "2026-07-28T06:45:11.000Z",
        },
      ],
      totalCount: 1,
    });
    vi.mocked(api.getDrawingSnapshot).mockRejectedValueOnce(
      new Error("snapshot unavailable"),
    );

    render(
      <HistoryPanel
        drawingId="drawing-1"
        getCurrentVersion={() => 4}
        isOpen
        onClose={vi.fn()}
        onRestore={vi.fn()}
        onPreview={onPreview}
      />,
    );

    fireEvent.click(await screen.findByText("Version 4"));

    await waitFor(() => {
      expect(api.getDrawingSnapshot).toHaveBeenCalledWith(
        "drawing-1",
        "snapshot-2",
      );
      expect(screen.getByTestId("history-dismiss-layer")).not.toHaveClass(
        "pointer-events-none",
      );
      expect(onPreview).toHaveBeenCalledWith(null);
    });
  });

  it("ignores a snapshot response that arrives after the panel closes", async () => {
    let resolveSnapshot!: (snapshot: api.DrawingSnapshotFull) => void;
    const pendingSnapshot = new Promise<api.DrawingSnapshotFull>((resolve) => {
      resolveSnapshot = resolve;
    });
    const snapshot = {
      id: "snapshot-late",
      drawingId: "drawing-1",
      version: 5,
      createdAt: "2026-07-28T06:45:11.000Z",
      elements: [],
      appState: {},
      files: {},
    };
    vi.mocked(api.getDrawingHistory).mockResolvedValueOnce({
      snapshots: [snapshot],
      totalCount: 1,
    });
    vi.mocked(api.getDrawingSnapshot).mockReturnValueOnce(pendingSnapshot);
    const onPreview = vi.fn();

    const { rerender } = render(
      <HistoryPanel
        drawingId="drawing-1"
        getCurrentVersion={() => 5}
        isOpen
        onClose={vi.fn()}
        onRestore={vi.fn()}
        onPreview={onPreview}
      />,
    );
    fireEvent.click(await screen.findByText("Version 5"));

    rerender(
      <HistoryPanel
        drawingId="drawing-1"
        getCurrentVersion={() => 5}
        isOpen={false}
        onClose={vi.fn()}
        onRestore={vi.fn()}
        onPreview={onPreview}
      />,
    );
    await act(async () => {
      resolveSnapshot(snapshot);
      await pendingSnapshot;
    });

    expect(onPreview).not.toHaveBeenCalledWith(snapshot);
    expect(screen.queryByRole("dialog", { name: "Version history" })).toBeNull();
  });

  it("keeps the newest preview when snapshot responses arrive out of order", async () => {
    let resolveFirst!: (snapshot: api.DrawingSnapshotFull) => void;
    let resolveSecond!: (snapshot: api.DrawingSnapshotFull) => void;
    const firstSnapshot = new Promise<api.DrawingSnapshotFull>((resolve) => {
      resolveFirst = resolve;
    });
    const secondSnapshot = new Promise<api.DrawingSnapshotFull>((resolve) => {
      resolveSecond = resolve;
    });
    const snapshotA = {
      id: "snapshot-a",
      drawingId: "drawing-1",
      version: 6,
      createdAt: "2026-07-28T06:45:11.000Z",
      elements: [],
      appState: {},
      files: {},
    };
    const snapshotB = {
      ...snapshotA,
      id: "snapshot-b",
      version: 7,
    };
    vi.mocked(api.getDrawingHistory).mockResolvedValueOnce({
      snapshots: [snapshotA, snapshotB],
      totalCount: 2,
    });
    vi.mocked(api.getDrawingSnapshot).mockImplementation((_drawingId, id) =>
      id === snapshotA.id ? firstSnapshot : secondSnapshot,
    );
    const onPreview = vi.fn();

    render(
      <HistoryPanel
        drawingId="drawing-1"
        getCurrentVersion={() => 7}
        isOpen
        onClose={vi.fn()}
        onRestore={vi.fn()}
        onPreview={onPreview}
      />,
    );
    fireEvent.click(await screen.findByText("Version 6"));
    fireEvent.click(screen.getByText("Version 7"));

    await act(async () => {
      resolveSecond(snapshotB);
      await secondSnapshot;
    });
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenLastCalledWith(snapshotB);

    await act(async () => {
      resolveFirst(snapshotA);
      await firstSnapshot;
    });
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenLastCalledWith(snapshotB);
  });
});
