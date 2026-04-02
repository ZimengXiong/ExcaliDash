import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const Probe = () => {
  const { loading, authEnabled, authStatusError, retryAuthStatus } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="auth-enabled">{String(authEnabled)}</span>
      <span data-testid="auth-status-error">{String(authStatusError)}</span>
      <button data-testid="retry" onClick={() => void retryAuthStatus()}>retry</button>
    </div>
  );
};

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces a backend status error if /auth/status fails without a cached fallback", async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    vi.spyOn(axios, "get").mockRejectedValue(new Error("network down"));

    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("auth-enabled").textContent).toBe("null");
    expect(screen.getByTestId("auth-status-error").textContent).toContain(
      "Unable to reach the backend API"
    );
  });

  it("clears stored auth state when backend reports auth disabled", async () => {
    const storage = new Map<string, string>([
      ["excalidash-user", JSON.stringify({ id: "u1" })],
    ]);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    vi.spyOn(axios, "get").mockResolvedValueOnce({ data: { authEnabled: false } });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("auth-enabled").textContent).toBe("false");
    expect(screen.getByTestId("auth-status-error").textContent).toBe("null");
    expect(storage.get("excalidash-user")).toBeUndefined();
  });

  it("uses cached auth-disabled mode when /auth/status is temporarily unavailable", async () => {
    const storage = new Map<string, string>([
      ["excalidash-auth-enabled", "false"],
      ["excalidash-user", JSON.stringify({ id: "u1" })],
    ]);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    vi.spyOn(axios, "get").mockRejectedValue(new Error("network down"));

    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("auth-enabled").textContent).toBe("false");
    expect(screen.getByTestId("auth-status-error").textContent).toBe("null");
    expect(storage.get("excalidash-user")).toBeUndefined();
  });

  it("can recover after retry when auth status becomes reachable", async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    const getSpy = vi.spyOn(axios, "get");
    getSpy
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ data: { authEnabled: true } })
      .mockResolvedValueOnce({
        data: {
          user: { id: "u1", email: "u1@example.com", name: "User One" },
        },
      });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-status-error").textContent).toContain(
        "Unable to reach the backend API"
      );
    });

    fireEvent.click(screen.getByTestId("retry"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-enabled").textContent).toBe("true");
    });
    expect(screen.getByTestId("auth-status-error").textContent).toBe("null");
  });
});
