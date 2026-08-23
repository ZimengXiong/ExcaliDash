import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { PreferencesProvider } from "../../context/PreferencesContext";
import { useDashboardSort } from "./useDashboardSort";

vi.mock("../../api", () => ({
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

describe("useDashboardSort", () => {
  const getPrefsMock = vi.mocked(api.getUserPreferences);
  const updatePrefsMock = vi.mocked(api.updateUserPreferences);

  beforeEach(() => {
    vi.clearAllMocks();
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      },
    });
    updatePrefsMock.mockResolvedValue({});
  });

  it("does not PUT the default sort on first mount (no clobber)", async () => {
    // Server has a non-default preference; the initial GET is in flight.
    getPrefsMock.mockResolvedValue({
      dashboardSortField: "name",
      dashboardSortDirection: "asc",
    });

    const { result } = renderHook(() => useDashboardSort(), { wrapper });

    // Let the GET settle and hydration apply.
    await waitFor(() => {
      expect(result.current.sortConfig).toEqual({
        field: "name",
        direction: "asc",
      });
    });

    // The write path must never have PUT the local default before/at mount,
    // and must not echo the freshly fetched server value back.
    expect(updatePrefsMock).not.toHaveBeenCalled();
  });

  it("does not PUT when the server has no stored sort", async () => {
    getPrefsMock.mockResolvedValue({});

    const { result } = renderHook(() => useDashboardSort(), { wrapper });

    await waitFor(() => {
      expect(getPrefsMock).toHaveBeenCalledTimes(1);
    });
    // Flush any pending effects.
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.sortConfig).toEqual({
      field: "updatedAt",
      direction: "desc",
    });
    expect(updatePrefsMock).not.toHaveBeenCalled();
  });

  it("persists to the server on a user-initiated sort change", async () => {
    getPrefsMock.mockResolvedValue({});

    const { result } = renderHook(() => useDashboardSort(), { wrapper });

    await waitFor(() => {
      expect(getPrefsMock).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(updatePrefsMock).not.toHaveBeenCalled();

    act(() => {
      result.current.handleSortFieldChange("name");
    });

    await waitFor(() => {
      expect(updatePrefsMock).toHaveBeenCalledWith({
        dashboardSortField: "name",
        dashboardSortDirection: "asc",
      });
    });
    expect(updatePrefsMock).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(
      window.localStorage.getItem("excalidash-preferences") ?? "{}",
    );
    expect(stored).toMatchObject({
      dashboardSortField: "name",
      dashboardSortDirection: "asc",
    });
  });
});
