import React from "react";
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { PreferencesProvider } from "../context/PreferencesContext";

const mockCreateDrawing = vi.fn();
const mockUploadFiles = vi.fn();
const mockUseDashboardData = vi.fn();
const mockGetUserPreferences = vi.fn();
const mockUpdateUserPreferences = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual("../api");
  return {
    ...actual,
    createDrawing: (...args: unknown[]) => mockCreateDrawing(...args),
    getUserPreferences: (...args: unknown[]) => mockGetUserPreferences(...args),
    updateUserPreferences: (...args: unknown[]) =>
      mockUpdateUserPreferences(...args),
  };
});

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("../context/UploadContext", () => ({
  useUpload: () => ({
    uploadFiles: mockUploadFiles,
  }),
}));

vi.mock("./dashboard/useDashboardData", () => ({
  useDashboardData: (...args: unknown[]) => mockUseDashboardData(...args),
}));

vi.mock("../components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/DrawingCard", () => ({
  DrawingCard: () => <div>Drawing Card</div>,
}));

vi.mock("../components/ConfirmModal", () => ({
  ConfirmModal: () => null,
}));

describe("Dashboard - Collection Sharing Viewer Restrictions", () => {
  beforeAll(() => {
    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserPreferences.mockResolvedValue({});
    mockUpdateUserPreferences.mockResolvedValue({});
    mockUseDashboardData.mockReturnValue({
      drawings: [],
      setDrawings: vi.fn(),
      collections: [
        {
          id: "shared-col-1",
          name: "Shared Collection",
          createdAt: Date.now(),
          isOwner: false,
          sharedRole: "view",
        },
      ],
      setCollections: vi.fn(),
      setTotalCount: vi.fn(),
      isFetchingMore: false,
      isLoading: false,
      hasMore: false,
      refreshData: vi.fn(),
      fetchMore: vi.fn(),
    });
  });

  it("blocks New Drawing for view-only shared collections", () => {
    render(
      <PreferencesProvider>
        <MemoryRouter initialEntries={["/collections?id=shared-col-1"]}>
          <Routes>
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /new drawing/i }));

    expect(mockCreateDrawing).not.toHaveBeenCalled();
    expect(screen.getByText("Viewers can't create new drawings")).toBeInTheDocument();
  });

  it("blocks Import for view-only shared collections", () => {
    render(
      <PreferencesProvider>
        <MemoryRouter initialEntries={["/collections?id=shared-col-1"]}>
          <Routes>
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /import/i }));

    expect(mockUploadFiles).not.toHaveBeenCalled();
    expect(screen.getByText("Viewers can't import drawings")).toBeInTheDocument();
  });
});
