import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import * as aiApi from "../../api/ai";
import * as agentChat from "./useAgentChat";
import { ChatPanel } from "./ChatPanel";

vi.mock("../../api/ai", () => ({ getAiStatus: vi.fn() }));
vi.mock("./useAgentChat", () => ({ useAgentChat: vi.fn() }));

const getAiStatusMock = vi.mocked(aiApi.getAiStatus);
const useAgentChatMock = vi.mocked(agentChat.useAgentChat);

const chatValue = (overrides: Partial<ReturnType<typeof agentChat.useAgentChat>> = {}) => ({
  messages: [],
  isStreaming: false,
  sendMessage: vi.fn(),
  stop: vi.fn(),
  undoBatch: vi.fn(),
  clear: vi.fn(),
  ...overrides,
});

const Harness = () => {
  const ref = useRef<Set<string>>(new Set());
  return <ChatPanel drawingId="d1" canEdit selfAgentBatchIdsRef={ref} />;
};

describe("ChatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentChatMock.mockReturnValue(chatValue());
  });

  it("renders nothing when the AI proxy is unavailable", async () => {
    getAiStatusMock.mockResolvedValue({
      available: false,
      provider: "disabled",
      model: null,
      keyConfigured: false,
      keySource: null,
    });
    const { container } = render(<Harness />);
    await waitFor(() => expect(getAiStatusMock).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("does not probe status when the user lacks edit access", async () => {
    const ref = { current: new Set<string>() };
    render(<ChatPanel drawingId="d1" canEdit={false} selfAgentBatchIdsRef={ref} />);
    await Promise.resolve();
    expect(getAiStatusMock).not.toHaveBeenCalled();
  });

  it("opens the panel and sends a message", async () => {
    const sendMessage = vi.fn();
    useAgentChatMock.mockReturnValue(chatValue({ sendMessage }));
    getAiStatusMock.mockResolvedValue({
      available: true,
      provider: "anthropic",
      model: "claude",
      keyConfigured: true,
      keySource: "env",
    });
    render(<Harness />);

    fireEvent.click(await screen.findByLabelText("Open canvas assistant"));

    const textarea = screen.getByLabelText(/Ask the assistant/i);
    fireEvent.change(textarea, { target: { value: "draw a box" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(sendMessage).toHaveBeenCalledWith("draw a box");
  });

  it("renders an applied batch card and undoes it", async () => {
    const undoBatch = vi.fn();
    useAgentChatMock.mockReturnValue(
      chatValue({
        undoBatch,
        messages: [
          {
            id: "u1",
            role: "user",
            text: "draw a box",
            batches: [],
            streaming: false,
          },
          {
            id: "a1",
            role: "assistant",
            text: "Done.",
            streaming: false,
            batches: [
              {
                opsBatchId: "b1",
                version: 5,
                revertVersion: 4,
                summaryDelta: ["rect r1 0,0 100x50"],
                status: "applied",
              },
            ],
          },
        ],
      }),
    );
    getAiStatusMock.mockResolvedValue({
      available: true,
      provider: "anthropic",
      model: "claude",
      keyConfigured: true,
      keySource: "env",
    });
    render(<Harness />);
    fireEvent.click(await screen.findByLabelText("Open canvas assistant"));

    expect(screen.getByText("Applied to canvas")).toBeInTheDocument();
    expect(screen.getByText("rect r1 0,0 100x50")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undoBatch).toHaveBeenCalledWith(
      expect.objectContaining({ opsBatchId: "b1", revertVersion: 4 }),
    );
  });

  it("shows a stop control while streaming", async () => {
    useAgentChatMock.mockReturnValue(chatValue({ isStreaming: true }));
    getAiStatusMock.mockResolvedValue({
      available: true,
      provider: "anthropic",
      model: "claude",
      keyConfigured: true,
      keySource: "env",
    });
    render(<Harness />);
    fireEvent.click(await screen.findByLabelText("Open canvas assistant"));
    expect(screen.getByLabelText("Stop")).toBeInTheDocument();
  });

  it("marks a reverted batch and disables its button", async () => {
    useAgentChatMock.mockReturnValue(
      chatValue({
        messages: [
          {
            id: "a1",
            role: "assistant",
            text: "",
            streaming: false,
            batches: [
              {
                opsBatchId: "b1",
                version: 5,
                revertVersion: 4,
                summaryDelta: [],
                status: "reverted",
              },
            ],
          },
        ],
      }),
    );
    getAiStatusMock.mockResolvedValue({
      available: true,
      provider: "anthropic",
      model: "claude",
      keyConfigured: true,
      keySource: "env",
    });
    render(<Harness />);
    fireEvent.click(await screen.findByLabelText("Open canvas assistant"));

    const card = screen.getByText("Applied to canvas").closest("div")!;
    const undone = within(card.parentElement as HTMLElement).getByRole("button", {
      name: "Undone",
    });
    expect(undone).toBeDisabled();
  });
});
