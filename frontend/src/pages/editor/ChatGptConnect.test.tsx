import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as chatgptApi from "../../api/chatgpt";
import { ChatGptConnect } from "./ChatGptConnect";

vi.mock("../../api/chatgpt", () => ({
  startChatGptConnect: vi.fn(),
  completeChatGptConnect: vi.fn(),
}));

const startMock = vi.mocked(chatgptApi.startChatGptConnect);
const completeMock = vi.mocked(chatgptApi.completeChatGptConnect);

const connectedStatus: chatgptApi.ChatGptConnectionStatus = {
  enabled: true,
  isActiveProvider: true,
  connected: true,
  needsReconnect: false,
  accountEmail: "user@example.com",
  planType: "plus",
  models: ["gpt-5.1"],
  redirectUri: "http://localhost:1455/auth/callback",
};

describe("ChatGptConnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("open", vi.fn());
  });

  it("starts OAuth, opens the authorize URL, then shows the paste step", async () => {
    startMock.mockResolvedValue({
      authorizeUrl: "https://auth.openai.com/oauth/authorize?x=1",
      redirectUri: "http://localhost:1455/auth/callback",
    });
    const onConnected = vi.fn();
    render(<ChatGptConnect needsReconnect={false} onConnected={onConnected} />);

    fireEvent.click(screen.getByRole("button", { name: /connect chatgpt/i }));

    await waitFor(() => expect(startMock).toHaveBeenCalled());
    expect(window.open).toHaveBeenCalledWith(
      "https://auth.openai.com/oauth/authorize?x=1",
      "_blank",
      "noopener,noreferrer",
    );
    expect(
      await screen.findByPlaceholderText(/localhost:1455/i),
    ).toBeInTheDocument();
  });

  it("completes the connection from the pasted redirect URL", async () => {
    startMock.mockResolvedValue({
      authorizeUrl: "https://auth.openai.com/oauth/authorize",
      redirectUri: "http://localhost:1455/auth/callback",
    });
    completeMock.mockResolvedValue(connectedStatus);
    const onConnected = vi.fn();
    render(<ChatGptConnect needsReconnect={false} onConnected={onConnected} />);

    fireEvent.click(screen.getByRole("button", { name: /connect chatgpt/i }));
    const paste = await screen.findByPlaceholderText(/localhost:1455/i);
    fireEvent.change(paste, {
      target: { value: "http://localhost:1455/auth/callback?code=c&state=s" },
    });
    fireEvent.click(screen.getByRole("button", { name: /finish connecting/i }));

    await waitFor(() => expect(completeMock).toHaveBeenCalledWith(
      "http://localhost:1455/auth/callback?code=c&state=s",
    ));
    expect(onConnected).toHaveBeenCalledWith(connectedStatus);
  });

  it("shows a reconnect notice when needed", () => {
    render(<ChatGptConnect needsReconnect onConnected={vi.fn()} />);
    expect(screen.getByText(/connection expired/i)).toBeInTheDocument();
  });
});
