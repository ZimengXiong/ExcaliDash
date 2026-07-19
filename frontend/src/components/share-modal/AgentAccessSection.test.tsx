import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { AgentAccessSection } from "./AgentAccessSection";

const authState = vi.hoisted(() => ({ aiEnabled: false }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => authState,
}));
vi.mock("../../api", () => ({
  listAgentTokens: vi.fn(),
  createAgentToken: vi.fn(),
  revokeAgentToken: vi.fn(),
  isAxiosError: vi.fn(),
}));

describe("AgentAccessSection global AI feature switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.aiEnabled = false;
  });

  it("renders nothing and does not probe tokens while disabled", async () => {
    const { container } = render(
      <AgentAccessSection drawingId="drawing-1" isOpen />,
    );
    await Promise.resolve();
    expect(container.textContent).toBe("");
    expect(api.listAgentTokens).not.toHaveBeenCalled();
  });

  it("loads existing tokens again after re-enabling", async () => {
    vi.mocked(api.listAgentTokens).mockResolvedValue([]);
    const { rerender } = render(
      <AgentAccessSection drawingId="drawing-1" isOpen />,
    );
    authState.aiEnabled = true;
    rerender(<AgentAccessSection drawingId="drawing-1" isOpen />);
    expect(api.listAgentTokens).toHaveBeenCalledWith("drawing-1");
  });
});
