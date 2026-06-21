import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Login } from "./Login";
import { Register } from "./Register";

const mockUseAuth = vi.fn();
const mockNavigate = vi.fn();

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

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const baseAuthState = {
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  authEnabled: true,
  registrationEnabled: true,
  authStatusError: null,
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

describe("auth page registration policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides the register link on the login page when registration is disabled", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      registrationEnabled: false,
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>
    );

    expect(screen.queryByRole("link", { name: /create a new account/i })).not.toBeInTheDocument();
    expect(screen.getByText(/sign in with an existing account/i)).toBeInTheDocument();
  });

  it("redirects away from /register when registration is disabled outside bootstrap flow", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuthState,
      registrationEnabled: false,
    });

    render(
      <MemoryRouter initialEntries={["/register"]}>
        <Register />
      </MemoryRouter>
    );

    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  });
});
