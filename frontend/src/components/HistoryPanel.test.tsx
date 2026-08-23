import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { HistoryPanel } from "./HistoryPanel";

vi.mock("../api", () => ({
  getDrawingHistory: vi.fn().mockResolvedValue({
    snapshots: [],
    totalCount: 0,
  }),
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
});
