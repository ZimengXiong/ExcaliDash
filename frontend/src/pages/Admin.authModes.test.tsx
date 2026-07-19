import { render, screen } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Admin } from "./Admin";

const { authState, accessState } = vi.hoisted(() => ({
  authState: {
    authEnabled: true as boolean | null,
    user: { id: "admin-1", role: "ADMIN" } as {
      id: string;
      role: string;
    } | null,
  },
  accessState: { oidcEnabled: false },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("../components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("../api", () => ({
  api: {
    get: vi.fn(async (path: string) => ({
      data: path === "/auth/users" ? { users: [] } : {},
    })),
  },
}));

vi.mock("./admin/useAdminCollections", () => ({
  useAdminCollections: () => ({
    collections: [],
    loadCollections: vi.fn(),
    handleSelectCollection: vi.fn(),
    handleCreateCollection: vi.fn(),
    handleEditCollection: vi.fn(),
    handleDeleteCollection: vi.fn(),
  }),
}));

vi.mock("./admin/useAccessControlSettings", () => ({
  useAccessControlSettings: () => ({
    ...accessState,
    registrationEnabled: false,
    localRegistrationAllowed: true,
    oidcProviderName: null,
    oidcJitProvisioningEnabled: null,
    loading: false,
    load: vi.fn(),
    toggleRegistration: vi.fn(),
    toggleOidcJitProvisioning: vi.fn(),
  }),
}));

vi.mock("./admin/useAiSettings", () => ({
  useAiSettings: () => ({
    loading: false,
    saving: false,
    providers: [],
    defaultProviderId: "",
    status: null,
    setDefaultProviderId: vi.fn(),
    addProvider: vi.fn(),
    updateProvider: vi.fn(),
    removeProvider: vi.fn(),
    save: vi.fn(),
  }),
}));

vi.mock("./admin/useLoginRateLimitSettings", () => ({
  useLoginRateLimitSettings: () => ({
    loading: false,
    saving: false,
    autoSaveQueued: false,
    dirty: false,
    enabled: true,
    windowMinutes: 15,
    maxAttempts: 20,
    resetIdentifier: "",
    resetLoading: false,
    setEnabled: vi.fn(),
    setWindowMinutes: vi.fn(),
    setMaxAttempts: vi.fn(),
    setResetIdentifier: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("./admin/AdminShell", () => ({
  AdminHeader: () => <h1>Admin</h1>,
  AdminStatusMessages: () => null,
}));
vi.mock("./admin/AiSettingsCard", () => ({
  AiSettingsCard: () => <section>AI provider registry</section>,
}));
vi.mock("./admin/AccessControlCard", () => ({
  AccessControlCard: () => <section>Access control</section>,
}));
vi.mock("./admin/LoginRateLimitCard", () => ({
  LoginRateLimitCard: () => <section>Login rate limit</section>,
}));
vi.mock("./admin/UsersTable", () => ({
  UsersTable: () => <section>Users table</section>,
}));
vi.mock("./admin/CreateUserForm", () => ({
  CreateUserForm: () => null,
}));
vi.mock("./admin/UserActionModals", () => ({
  UserActionModals: () => null,
}));

describe("Admin authentication mode visibility", () => {
  beforeEach(() => {
    authState.authEnabled = true;
    authState.user = { id: "admin-1", role: "ADMIN" };
    accessState.oidcEnabled = false;
  });

  it("shows only AI configuration in auth-disabled single-user mode", () => {
    authState.authEnabled = false;
    authState.user = null;

    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    expect(screen.getByText("AI provider registry")).toBeInTheDocument();
    expect(screen.queryByText("Access control")).not.toBeInTheDocument();
    expect(screen.queryByText("Login rate limit")).not.toBeInTheDocument();
    expect(screen.queryByText("Users table")).not.toBeInTheDocument();
  });

  it("shows AI configuration but not login limits for local auth", () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    expect(screen.getByText("AI provider registry")).toBeInTheDocument();
    expect(screen.getByText("Access control")).toBeInTheDocument();
    expect(screen.queryByText("Login rate limit")).not.toBeInTheDocument();
  });

  it("shows login limit administration when OIDC is enabled", () => {
    accessState.oidcEnabled = true;

    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );

    expect(screen.getByText("AI provider registry")).toBeInTheDocument();
    expect(screen.getByText("Login rate limit")).toBeInTheDocument();
  });
});
