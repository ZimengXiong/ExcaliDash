import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as aiApi from "../../api/ai";
import { useAgentChat } from "./useAgentChat";

vi.mock("../../api/ai", () => ({
  streamAgentChat: vi.fn(),
  revertOpsBatch: vi.fn(),
}));

const streamMock = vi.mocked(aiApi.streamAgentChat);
const revertMock = vi.mocked(aiApi.revertOpsBatch);

describe("useAgentChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams tokens and ops into a single assistant message and registers self batches", async () => {
    const selfBatches: string[] = [];
    streamMock.mockImplementation(async (_params, handlers) => {
      handlers.onToken?.("Adding a box.");
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
    expect(assistant.streaming).toBe(false);
    expect(assistant.batches).toHaveLength(1);
    expect(assistant.batches[0]).toMatchObject({
      opsBatchId: "batch-1",
      revertVersion: 4,
      status: "applied",
    });
    expect(selfBatches).toEqual(["batch-1"]);
    // Conversation history (user turn only) is forwarded to the stream.
    expect(streamMock.mock.calls[0][0].messages).toEqual([
      { role: "user", content: "draw a box" },
    ]);
  });

  it("forwards prior turns as conversation history", async () => {
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

    expect(streamMock.mock.calls[1][0].messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "second" },
    ]);
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
