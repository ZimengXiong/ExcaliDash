import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { PreferencesProvider, usePreference } from "./PreferencesContext";

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

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

describe("PreferencesContext", () => {
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
    state.user = null;
    getPrefsMock.mockResolvedValue({});
    updatePrefsMock.mockResolvedValue({});
  });

  it("hydrates a preference from the server and does not echo it back", async () => {
    getPrefsMock.mockResolvedValue({ language: "fr-FR" });

    const { result } = renderHook(() => usePreference("language", "en"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current[0]).toBe("fr-FR");
    });
    // Flush the localStorage-mirror effect.
    await act(async () => {
      await Promise.resolve();
    });
    expect(updatePrefsMock).not.toHaveBeenCalled();
  });

  it("does not PUT before hydration settles (no clobber)", async () => {
    let resolveGet: (v: Record<string, never>) => void = () => {};
    getPrefsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      }) as ReturnType<typeof api.getUserPreferences>,
    );

    const { result } = renderHook(() => usePreference("language", "en"), {
      wrapper,
    });

    // User changes a preference while the initial GET is still in flight.
    act(() => {
      result.current[1]("de-DE");
    });
    expect(result.current[0]).toBe("de-DE");
    expect(updatePrefsMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveGet({});
      await Promise.resolve();
    });
    // Gate holds: the pre-hydration change stays local-only.
    expect(updatePrefsMock).not.toHaveBeenCalled();
  });

  it("PUTs a user-initiated change after hydration", async () => {
    const { result } = renderHook(() => usePreference("language", "en"), {
      wrapper,
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current[1]("es-ES");
    });

    await waitFor(() => {
      expect(updatePrefsMock).toHaveBeenCalledWith({ language: "es-ES" });
    });
    const stored = JSON.parse(
      window.localStorage.getItem("excalidash-preferences") ?? "{}",
    );
    expect(stored.language).toBe("es-ES");
  });

  it("refetches when the authenticated user id changes", async () => {
    getPrefsMock.mockResolvedValueOnce({});
    getPrefsMock.mockResolvedValueOnce({ language: "it-IT" });

    const { result, rerender } = renderHook(
      () => usePreference("language", "en"),
      { wrapper },
    );

    await waitFor(() => {
      expect(getPrefsMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current[0]).toBe("en");

    state.user = { id: "user-1" };
    rerender();

    await waitFor(() => {
      expect(getPrefsMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current[0]).toBe("it-IT");
    });
  });
});
