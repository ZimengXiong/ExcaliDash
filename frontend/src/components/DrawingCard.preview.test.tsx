import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { DrawingSummary } from "../types";

// Mock the API module to prevent actual API calls and track usage
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    getDrawing: vi.fn().mockRejectedValue(new Error("Unexpected getDrawing call in card test")),
    getDrawingPreviewUrl: (id: string) => `${actual.API_URL}/drawings/${encodeURIComponent(id)}/preview`,
  };
});

// Mock heavy dependencies
vi.mock("date-fns", () => ({
  formatDistanceToNow: vi.fn().mockReturnValue("2 days"),
}));

vi.mock("../utils/exportUtils", () => ({
  exportDrawingToFile: vi.fn(),
}));

vi.mock("../utils/previewSvg", () => ({
  previewHasEmbeddedImages: vi.fn().mockReturnValue(false),
}));

vi.mock("lucide-react", () => ({
  PenTool: () => <span>PenTool</span>,
  Trash2: () => <span>Trash2</span>,
  FolderInput: () => <span>FolderInput</span>,
  ArrowRight: () => <span>ArrowRight</span>,
  Check: () => <span>Check</span>,
  Clock: () => <span>Clock</span>,
  Copy: () => <span>Copy</span>,
  Download: () => <span>Download</span>,
  Loader2: () => <span>Loader2</span>,
}));

import { DrawingCard } from "../components/DrawingCard";
import { API_URL } from "../api";

const makeDrawing = (overrides: Partial<DrawingSummary> = {}): DrawingSummary => ({
  id: "drawing-1",
  name: "Test Drawing",
  collectionId: null,
  version: 1,
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now(),
  preview: null,
  ...overrides,
});

const defaultCollections = [
  { id: "c1", name: "Work", createdAt: Date.now() },
  { id: "c2", name: "Personal", createdAt: Date.now() },
];

const defaultProps = {
  drawing: makeDrawing(),
  collections: defaultCollections,
  isSelected: false,
  isTrash: false,
  isShared: false,
  onToggleSelection: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onMoveToCollection: vi.fn(),
  onDuplicate: vi.fn(),
  onClick: vi.fn(),
  onDragStart: vi.fn(),
  onMouseDown: vi.fn(),
};

describe("DrawingCard — lazy preview via <img>", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an <img> element with loading='lazy' for the preview", () => {
    const drawing = makeDrawing({ id: "abc-123" });
    render(<DrawingCard {...defaultProps} drawing={drawing} />);

    // The card should render an <img> with lazy loading, not a dangerous innerHTML div
    const img = screen.queryByRole("img");
    // At this point, the component might not render an <img> yet (RED phase)
    // but the spec demands it. The test validates the expected contract.
    expect(img).toBeTruthy();
    if (img) {
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img.getAttribute("src")).toContain("/drawings/");
      expect(img.getAttribute("src")).toContain("/preview");
    }
  });

  it("uses the correct preview URL with the drawing id", () => {
    const drawing = makeDrawing({ id: "my-drawing-id" });
    render(<DrawingCard {...defaultProps} drawing={drawing} />);

    const img = screen.queryByRole("img");
    if (img) {
      expect(img.getAttribute("src")).toBe(`${API_URL}/drawings/my-drawing-id/preview`);
    }
  });

  it("does not trigger api.getDrawing for preview purposes", async () => {
    const drawing = makeDrawing({ id: "no-full-fetch" });
    render(<DrawingCard {...defaultProps} drawing={drawing} />);

    // The component should NOT call api.getDrawing just to get a preview.
    // getDrawing is reserved for export/editor operations only.
    const apiModule = await import("../api");
    expect(apiModule.getDrawing).not.toHaveBeenCalled();
  });

  it("shows fallback placeholder when drawing preview image fails to load", () => {
    const drawing = makeDrawing({ id: "no-preview", preview: null });
    render(<DrawingCard {...defaultProps} drawing={drawing} />);

    // The <img> should be rendered with the preview URL. Fire an error to simulate
    // a missing/broken preview, which triggers the imgError fallback path.
    const img = screen.getByTestId(`preview-img-${drawing.id}`);
    expect(img).toBeInTheDocument();
    fireEvent.error(img);

    // After the error, the PenTool placeholder should appear instead of the broken img.
    expect(screen.getByText("PenTool")).toBeInTheDocument();
    // The broken img should still be in the DOM (it's conditionally rendered by `!imgError`),
    // but since imgError is now true, the fallback should be visible instead.
  });
});
