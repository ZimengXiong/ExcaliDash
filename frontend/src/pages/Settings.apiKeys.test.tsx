import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiKeysCard } from "./profile/ApiKeysCard";
import * as api from "../api";

const { mockLogout, mockAuthUser, mockAuthEnabled } = vi.hoisted(() => ({
  mockLogout: vi.fn(),
  mockAuthUser: vi.fn(),
  mockAuthEnabled: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: mockAuthUser(),
    logout: mockLogout,
    authEnabled: mockAuthEnabled(),
    updateUser: vi.fn(),
  }),
}));

vi.mock("../components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("../api", () => ({
  API_KEY_SCOPES: [
    "drawings:read",
    "drawings:write",
    "collections:read",
    "collections:write",
  ],
  api: {
    put: vi.fn(),
    post: vi.fn(),
  },
  isAxiosError: vi.fn(() => false),
  getCollections: vi.fn(),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

const existingApiKey = {
  id: "key-1",
  name: "Existing Key",
  prefix: "exd_key_abc123",
  scopes: ["drawings:read", "drawings:write"],
  createdAt: "2026-05-01T12:00:00.000Z",
  updatedAt: "2026-05-01T12:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
};

const ApiKeysHarness: React.FC<{ disabled?: boolean }> = ({
  disabled = false,
}) => {
  const [success, setSuccess] = useState("");
  return (
    <>
      {success ? <p>{success}</p> : null}
      <ApiKeysCard disabled={disabled} onSuccess={setSuccess} />
    </>
  );
};

describe("Settings API keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser.mockReturnValue({
      id: "user-1",
      email: "user@example.com",
      name: "User One",
    });
    mockAuthEnabled.mockReturnValue(true);
    vi.mocked(api.getCollections).mockResolvedValue([]);
    vi.mocked(api.listApiKeys).mockResolvedValue([existingApiKey]);
    vi.mocked(api.createApiKey).mockImplementation(async (name, scopes) => ({
      apiKey: {
        ...existingApiKey,
        id: "key-2",
        name,
        prefix: "exd_key_new456",
        scopes: scopes ?? [
          "drawings:read",
          "drawings:write",
          "collections:read",
          "collections:write",
        ],
      },
      token: "exd_key_new456.secret-token-value",
    }));
    vi.mocked(api.revokeApiKey).mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("lists, creates, copies, and revokes API keys", async () => {
    render(
      <MemoryRouter>
        <ApiKeysHarness />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Existing Key")).toBeInTheDocument();
    expect(screen.queryByText("exd_key_abc123")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /details for api key existing key/i }),
    );
    expect(screen.getByText("exd_key_abc123")).toBeInTheDocument();
    expect(
      screen.getByText("drawings:read, drawings:write"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Last used/)).toHaveTextContent("Last used Never");

    fireEvent.change(screen.getByLabelText(/api key name/i), {
      target: { value: "CI Token" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create api key/i }));

    expect(
      await screen.findByDisplayValue("exd_key_new456.secret-token-value"),
    ).toBeInTheDocument();
    expect(screen.getByText(/copy this token now/i)).toBeInTheDocument();
    expect(api.createApiKey).toHaveBeenCalledWith("CI Token", [
      "drawings:read",
      "drawings:write",
      "collections:read",
      "collections:write",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: /copy generated api token/i }),
    );
    await waitFor(() => {
      expect(navigator.clipboard?.writeText).toHaveBeenCalledWith(
        "exd_key_new456.secret-token-value",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(
      screen.queryByDisplayValue("exd_key_new456.secret-token-value"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /revoke api key ci token/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^revoke$/i }));

    await waitFor(() => {
      expect(api.revokeApiKey).toHaveBeenCalledWith("key-2");
    });
    expect(await screen.findByText("API key revoked")).toBeInTheDocument();
  });

  it("shows API key management independently of authentication mode", async () => {
    mockAuthEnabled.mockReturnValue(false);
    mockAuthUser.mockReturnValue(null);

    render(
      <MemoryRouter>
        <ApiKeysHarness />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Existing Key")).toBeInTheDocument();
    expect(screen.getByText("API Keys")).toBeInTheDocument();
  });

  it("does not load or show API key management while password reset is required", async () => {
    mockAuthUser.mockReturnValue({
      id: "user-1",
      email: "user@example.com",
      name: "User One",
      mustResetPassword: true,
    });

    render(
      <MemoryRouter>
        <ApiKeysHarness disabled />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        /api key management is unavailable until you reset your password/i,
      ),
    ).toBeInTheDocument();
    expect(api.listApiKeys).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/api key name/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create api key/i }),
    ).not.toBeInTheDocument();
  });

  it("disables API key creation while keys are loading", async () => {
    let resolveApiKeys: (keys: Array<typeof existingApiKey>) => void = () =>
      undefined;
    vi.mocked(api.listApiKeys).mockReturnValue(
      new Promise((resolve) => {
        resolveApiKeys = resolve;
      }),
    );

    render(
      <MemoryRouter>
        <ApiKeysHarness />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/api key name/i), {
      target: { value: "CI Token" },
    });

    const createButton = screen.getByRole("button", {
      name: /create api key/i,
    });
    expect(createButton).toBeDisabled();
    fireEvent.click(createButton);
    expect(api.createApiKey).not.toHaveBeenCalled();

    resolveApiKeys([existingApiKey]);
    expect(await screen.findByText("Existing Key")).toBeInTheDocument();
  });

  it("submits and displays custom API key scopes", async () => {
    render(
      <MemoryRouter>
        <ApiKeysHarness />
      </MemoryRouter>,
    );

    await screen.findByText("Existing Key");

    fireEvent.change(screen.getByLabelText(/api key name/i), {
      target: { value: "Read Token" },
    });
    fireEvent.click(screen.getByLabelText(/write drawings/i));
    fireEvent.click(screen.getByLabelText(/read collections/i));
    fireEvent.click(screen.getByLabelText(/write collections/i));
    fireEvent.click(screen.getByRole("button", { name: /create api key/i }));

    expect(
      await screen.findByDisplayValue("exd_key_new456.secret-token-value"),
    ).toBeInTheDocument();
    expect(api.createApiKey).toHaveBeenCalledWith("Read Token", [
      "drawings:read",
    ]);
    fireEvent.click(
      screen.getByRole("button", { name: /details for api key read token/i }),
    );
    expect(screen.getAllByText("drawings:read").length).toBeGreaterThan(0);
  });

  it("disables API key creation and shows validation when no scopes are selected", async () => {
    render(
      <MemoryRouter>
        <ApiKeysHarness />
      </MemoryRouter>,
    );

    await screen.findByText("Existing Key");

    fireEvent.change(screen.getByLabelText(/api key name/i), {
      target: { value: "No Scope Token" },
    });
    fireEvent.click(screen.getByLabelText(/read drawings/i));
    fireEvent.click(screen.getByLabelText(/write drawings/i));
    fireEvent.click(screen.getByLabelText(/read collections/i));
    fireEvent.click(screen.getByLabelText(/write collections/i));

    expect(
      screen.getByText(/select at least one api key scope/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create api key/i }),
    ).toBeDisabled();
    expect(api.createApiKey).not.toHaveBeenCalled();
  });

  it("keeps a one-time token visible if creating another API key fails", async () => {
    vi.mocked(api.createApiKey)
      .mockResolvedValueOnce({
        apiKey: {
          ...existingApiKey,
          id: "key-2",
          name: "First Token",
          prefix: "exd_key_first",
        },
        token: "exd_key_first.secret-token-value",
      })
      .mockRejectedValueOnce(new Error("Network error"));

    render(
      <MemoryRouter>
        <ApiKeysHarness />
      </MemoryRouter>,
    );

    await screen.findByText("Existing Key");

    fireEvent.change(screen.getByLabelText(/api key name/i), {
      target: { value: "First Token" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create api key/i }));

    expect(
      await screen.findByDisplayValue("exd_key_first.secret-token-value"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/api key name/i), {
      target: { value: "Second Token" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create api key/i }));

    expect(
      await screen.findByText(/failed to create api key/i),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("exd_key_first.secret-token-value"),
    ).toBeInTheDocument();
  });
});
