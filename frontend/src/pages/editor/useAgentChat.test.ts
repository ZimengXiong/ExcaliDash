import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as aiApi from "../../api/ai";
import { useAgentChat } from "./useAgentChat";

vi.mock("../../api/ai", () => ({
  getAgentChatMessages: vi.fn(),
  streamAgentChat: vi.fn(),
  revertOpsBatch: vi.fn(),
}));

const streamMock = vi.mocked(aiApi.streamAgentChat);
const revertMock = vi.mocked(aiApi.revertOpsBatch);
const historyMock = vi.mocked(aiApi.getAgentChatMessages);

describe("useAgentChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    historyMock.mockResolvedValue([]);
  });

  it("hydrates the drawing transcript from the server after a refresh", async () => {
    historyMock.mockResolvedValue([
      {
        id: "persisted-user",
        drawingId: "d1",
        turnId: "turn-1",
        role: "user",
        text: "Earlier question",
        status: "complete",
        tools: [],
        batches: [],
        opErrors: [],
        author: { id: "u1", name: "Alice" },
        createdAt: "2026-07-12T10:00:00.000Z",
        updatedAt: "2026-07-12T10:00:00.000Z",
      },
      {
        id: "persisted-assistant",
        drawingId: "d1",
        turnId: "turn-1",
        role: "assistant",
        text: "Earlier answer",
        status: "complete",
        tools: [],
        batches: [],
        opErrors: [],
        createdAt: "2026-07-12T10:00:00.000Z",
        updatedAt: "2026-07-12T10:00:01.000Z",
      },
    ]);
    const { result } = renderHook(() => useAgentChat({ drawingId: "d1" }));

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[0]).toMatchObject({
      id: "persisted-user",
      text: "Earlier question",
      author: { name: "Alice" },
    });
    expect(result.current.messages[1]).toMatchObject({
      id: "persisted-assistant",
      text: "Earlier answer",
    });
  });

  it("applies shared message and delta events from the drawing socket", async () => {
    const listeners = new Map<string, (payload: any) => void>();
    const socket = {
      on: vi.fn((event: string, listener: (payload: any) => void) => {
        listeners.set(event, listener);
      }),
      off: vi.fn((event: string) => listeners.delete(event)),
    } as any;
    const { result } = renderHook(() => useAgentChat({ drawingId: "d1", socket }));
    await waitFor(() => expect(historyMock).toHaveBeenCalled());

    act(() => {
      listeners.get("ai-chat-message")?.({
        drawingId: "d1",
        clientRequestId: "remote-request",
        message: {
          id: "remote-assistant",
          drawingId: "d1",
          turnId: "remote-turn",
          role: "assistant",
          text: "",
          status: "streaming",
          tools: [],
          batches: [],
          opErrors: [],
          createdAt: "2026-07-12T11:00:00.000Z",
          updatedAt: "2026-07-12T11:00:00.000Z",
        },
      });
      listeners.get("ai-chat-event")?.({
        drawingId: "d1",
        clientRequestId: "remote-request",
        messageId: "remote-assistant",
        event: "token",
        data: { text: "Shared answer" },
      });
    });

    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: "remote-assistant", text: "Shared answer" }),
    ]);
  });

  it("streams tokens and ops into a single assistant message and registers self batches", async () => {
    const selfBatches: string[] = [];
    streamMock.mockImplementation(async (_params, handlers) => {
      handlers.onThinking?.("I should inspect ");
      handlers.onThinking?.("the current layout.");
      handlers.onToken?.("Adding ");
      handlers.onToken?.("a box.");
      handlers.onOpsApplied?.({
        opsBatchId: "batch-1",
        version: 5,
        revertVersion: 4,
        summaryDelta: ["rect r1 0,0 100x50"],
      });
      handlers.onDone?.();
    });

    const { result } = renderHook(() =>
      useAgentChat({
        drawingId: "d1",
        onSelfOpsBatch: (id) => selfBatches.push(id),
      }),
    );

    await act(async () => {
      await result.current.sendMessage("draw a box");
    });

    const { messages } = result.current;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", text: "draw a box" });
    const assistant = messages[1];
    expect(assistant.role).toBe("assistant");
    expect(assistant.text).toBe("Adding a box.");
    expect(assistant.thinking).toBe("I should inspect the current layout.");
    expect(assistant.streaming).toBe(false);
    expect(assistant.batches).toHaveLength(1);
    expect(assistant.batches[0]).toMatchObject({
      opsBatchId: "batch-1",
      revertVersion: 4,
      status: "applied",
    });
    expect(selfBatches).toEqual(["batch-1"]);
    expect(streamMock.mock.calls[0][0].message).toBe("draw a box");
    expect(streamMock.mock.calls[0][0].clientRequestId).toEqual(expect.any(String));
  });

  it("sends only the new turn because history is server-owned", async () => {
    streamMock.mockImplementation(async (_p, h) => {
      h.onToken?.("ok");
      h.onDone?.();
    });
    const { result } = renderHook(() => useAgentChat({ drawingId: "d1" }));

    await act(async () => {
      await result.current.sendMessage("first");
    });
    await act(async () => {
      await result.current.sendMessage("second");
    });

    expect(streamMock.mock.calls[0][0].message).toBe("first");
    expect(streamMock.mock.calls[1][0].message).toBe("second");
    expect(streamMock.mock.calls[1][0]).not.toHaveProperty("messages");
  });

  it("captures and forwards the live canvas image", async () => {
    streamMock.mockImplementation(async (_p, h) => h.onDone?.());
    const captureCanvasContext = vi.fn().mockResolvedValue({
      state: "captured",
      imageDataUrl: "data:image/png;base64,AAAA",
    });
    const { result } = renderHook(() =>
      useAgentChat({ drawingId: "d1", providerId: "gemini", captureCanvasContext }),
    );

    await act(async () => {
      await result.current.sendMessage("inspect the layout");
    });

    expect(captureCanvasContext).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0][0].canvasImage).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(streamMock.mock.calls[0][0].providerId).toBe("gemini");
    expect(streamMock.mock.calls[0][0].canvasState).toBe("captured");
  });

  it("forwards an explicit blank canvas without an empty image", async () => {
    streamMock.mockImplementation(async (_p, handlers) => handlers.onDone?.());
    const captureCanvasContext = vi.fn().mockResolvedValue({ state: "blank" });
    const { result } = renderHook(() =>
      useAgentChat({ drawingId: "d1", captureCanvasContext }),
    );

    await act(async () => result.current.sendMessage("start from scratch"));

    expect(streamMock.mock.calls[0][0]).toMatchObject({
      canvasState: "blank",
      canvasImage: undefined,
    });
  });

  it("tracks tool start and result events without ending the conversation", async () => {
    streamMock.mockImplementation(async (_p, handlers) => {
      handlers.onToolCall?.({ id: "view-1", name: "view_canvas" });
      handlers.onToolResult?.({
        id: "view-1",
        name: "view_canvas",
        ok: true,
        message: "Canvas snapshot attached",
      });
      handlers.onToken?.("The spacing looks balanced.");
      handlers.onDone?.();
    });
    const { result } = renderHook(() => useAgentChat({ drawingId: "d1" }));

    await act(async () => {
      await result.current.sendMessage("What do you think of the layout?");
    });

    expect(result.current.messages[1]).toMatchObject({
      text: "The spacing looks balanced.",
      tools: [
        {
          id: "view-1",
          name: "view_canvas",
          status: "success",
          message: "Canvas snapshot attached",
        },
      ],
    });
  });

  it("surfaces op validation errors on the assistant message", async () => {
    streamMock.mockImplementation(async (_p, h) => {
      h.onError?.({
        code: "OPS_VALIDATION_FAILED",
        message: "Ops rejected",
        errors: [{ opIndex: 0, code: "ELEMENT_NOT_FOUND", message: "missing" }],
      });
      h.onDone?.();
    });
    const { result } = renderHook(() => useAgentChat({ drawingId: "d1" }));

    await act(async () => {
      await result.current.sendMessage("connect x to y");
    });

    const assistant = result.current.messages[1];
    expect(assistant.error).toBe("Ops rejected");
    expect(assistant.opErrors).toHaveLength(1);
    expect(assistant.opErrors?.[0].code).toBe("ELEMENT_NOT_FOUND");
  });

  it("does not send when drawingId is missing or input is blank", async () => {
    const { result } = renderHook(() => useAgentChat({ drawingId: undefined }));
    await act(async () => {
      await result.current.sendMessage("hi");
    });
    expect(streamMock).not.toHaveBeenCalled();

    const withId = renderHook(() => useAgentChat({ drawingId: "d1" }));
    await act(async () => {
      await withId.result.current.sendMessage("   ");
    });
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("cleans up after a rejected stream so a later send works", async () => {
    streamMock.mockRejectedValueOnce(new Error("stream failed"));
    const { result } = renderHook(() => useAgentChat({ drawingId: "d1" }));
    await expect(act(() => result.current.sendMessage("first"))).rejects.toThrow(
      "stream failed",
    );
    expect(result.current.isStreaming).toBe(false);
    streamMock.mockImplementationOnce(async (_p, h) => h.onToken?.("recovered"));
    await act(async () => result.current.sendMessage("second"));
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(result.current.messages.find((message) => message.text === "recovered")).toMatchObject({
      text: "recovered",
      streaming: false,
    });
  });

  it("undoes a batch via revertOpsBatch and marks it reverted", async () => {
    streamMock.mockImplementation(async (_p, h) => {
      h.onOpsApplied?.({
        opsBatchId: "batch-1",
        version: 5,
        revertVersion: 4,
        summaryDelta: [],
      });
      h.onDone?.();
    });
    revertMock.mockResolvedValue({
      opsBatchId: "batch-2",
      version: 6,
      revertVersion: 5,
    });
    const selfBatches: string[] = [];
    const { result } = renderHook(() =>
      useAgentChat({
        drawingId: "d1",
        onSelfOpsBatch: (id) => selfBatches.push(id),
      }),
    );

    await act(async () => {
      await result.current.sendMessage("draw");
    });

    const batch = result.current.messages[1].batches[0];
    await act(async () => {
      await result.current.undoBatch(batch);
    });

    expect(revertMock).toHaveBeenCalledWith("d1", 4);
    // The undo's own batch is registered self-originated for native redo/undo.
    expect(selfBatches).toEqual(["batch-1", "batch-2"]);
    expect(result.current.messages[1].batches[0].status).toBe("reverted");
  });

  it("marks the batch revert-failed when the revert call rejects", async () => {
    streamMock.mockImplementation(async (_p, h) => {
      h.onOpsApplied?.({
        opsBatchId: "batch-1",
        version: 5,
        revertVersion: 4,
        summaryDelta: [],
      });
      h.onDone?.();
    });
    revertMock.mockRejectedValue(new Error("conflict"));
    const { result } = renderHook(() => useAgentChat({ drawingId: "d1" }));

    await act(async () => {
      await result.current.sendMessage("draw");
    });
    await act(async () => {
      await result.current.undoBatch(result.current.messages[1].batches[0]);
    });

    await waitFor(() =>
      expect(result.current.messages[1].batches[0].status).toBe(
        "revert-failed",
      ),
    );
  });
});
