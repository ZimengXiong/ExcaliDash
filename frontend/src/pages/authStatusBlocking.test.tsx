import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Login } from "./Login";
import { Register } from "./Register";

const mockUseAuth = vi.fn();

vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../api", () => ({
  startOidcSignIn: vi.fn(),
  api: {
    post: vi.fn(),
  },
  isAxiosError: vi.fn(() => false),
}));

vi.mock("../components/Logo", () => ({
  Logo: () => <div data-testid="logo" />,
}));

const baseAuthState = {
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  authEnabled: true,
  registrationEnabled: true,
  authStatusError: "Unable to reach the backend API. Check BACKEND_URL and reverse proxy settings, then retry.",
  retryAuthStatus: vi.fn(),
  oidcEnabled: false,
  oidcEnforced: false,
  oidcProvider: "OIDC",
  bootstrapRequired: false,
  authOnboardingRequired: false,
  isAuthenticated: false,
  loading: false,
  user: null,
};

describe("auth pages block on auth status failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the login page as a blocking error state", () => {
    mockUseAuth.mockReturnValue(baseAuthState);

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByText(/Unable to reach the backend API/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry connection/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Email address/i)).not.toBeInTheDocument();
  });

  it("renders the registration page as a blocking error state", () => {
    mockUseAuth.mockReturnValue(baseAuthState);

    render(
      <MemoryRouter initialEntries={["/register"]}>
        <Register />
      </MemoryRouter>
    );

    expect(screen.getByText(/Unable to reach the backend API/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry connection/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Your name/i)).not.toBeInTheDocument();
  });
});
