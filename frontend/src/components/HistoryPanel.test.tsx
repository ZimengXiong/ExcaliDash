import { render, screen } from "@testing-library/react";
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
  it("leaves the canvas visible and interactive beside the history sidebar", () => {
    const { container } = render(
      <HistoryPanel
        drawingId="drawing-1"
        getCurrentVersion={() => 1}
        isOpen
        onClose={vi.fn()}
        onRestore={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.getByText("Version history")).toBeInTheDocument();
    expect(document.querySelector(".backdrop-blur-sm")).not.toBeInTheDocument();
    expect(document.querySelector(".pointer-events-none")).toBeInTheDocument();
    expect(document.querySelector(".ui-side-panel")).toHaveClass(
      "pointer-events-auto",
      "md:w-96",
    );
    expect(container).toBeEmptyDOMElement();
    expect(api.getDrawingHistory).toHaveBeenCalledWith("drawing-1", {
      limit: 100,
    });
  });
});
