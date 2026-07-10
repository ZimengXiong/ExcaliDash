import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { PreferencesProvider } from "./PreferencesContext";
import { ThemeProvider, useTheme } from "./ThemeContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>
    <ThemeProvider>{children}</ThemeProvider>
  </PreferencesProvider>
);

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
}));

vi.mock("../api", () => ({
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: state.user }),
}));

describe("ThemeContext", () => {
  const getPrefsMock = vi.mocked(api.getUserPreferences);

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
    state.user = null;
    document.documentElement.classList.remove("dark");
    getPrefsMock.mockResolvedValue({});
  });

  it("re-fetches preferences when the authenticated user id changes", async () => {
    // Anonymous pre-login: no per-user theme yet.
    getPrefsMock.mockResolvedValueOnce({});
    // After login, this user prefers dark.
    getPrefsMock.mockResolvedValueOnce({ theme: "dark" });

    const { result, rerender } = renderHook(() => useTheme(), {
      wrapper,
    });

    await waitFor(() => {
      expect(getPrefsMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current.theme).toBe("light");

    // Simulate the user logging in — user id becomes available.
    state.user = { id: "user-1" };
    rerender();

    await waitFor(() => {
      expect(getPrefsMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.theme).toBe("dark");
    });
  });

  it("does not re-fetch on renders that keep the same user id", async () => {
    state.user = { id: "user-1" };
    getPrefsMock.mockResolvedValue({ theme: "dark" });

    const { rerender } = renderHook(() => useTheme(), {
      wrapper,
    });

    await waitFor(() => {
      expect(getPrefsMock).toHaveBeenCalledTimes(1);
    });

    rerender();
    rerender();

    // Same user id across renders must not trigger extra fetches.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getPrefsMock).toHaveBeenCalledTimes(1);
  });
});
