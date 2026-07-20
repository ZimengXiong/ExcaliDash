import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as aiApi from "../../api/ai";
import { useAgentChat } from "./useAgentChat";

vi.mock("../../api/ai", () => ({
  clearAgentChatMessages: vi.fn(),
  getAgentChatMessages: vi.fn(),
  streamAgentChat: vi.fn(),
  revertOpsBatch: vi.fn(),
}));

const streamMock = vi.mocked(aiApi.streamAgentChat);
const revertMock = vi.mocked(aiApi.revertOpsBatch);
const historyMock = vi.mocked(aiApi.getAgentChatMessages);

describe("useAgentChat lifecycle and undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    historyMock.mockResolvedValue([]);
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
    streamMock.mockImplementationOnce(async (_params, handlers) => {
      handlers.onToken?.("recovered");
    });
    await act(async () => result.current.sendMessage("second"));
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(
      result.current.messages.find((message) => message.text === "recovered"),
    ).toMatchObject({
      text: "recovered",
      streaming: false,
    });
  });

  it("aborts an in-progress generation when stopped", async () => {
    let receivedSignal: AbortSignal | undefined;
    streamMock.mockImplementation(
      async (params) =>
        new Promise<void>((resolve) => {
          receivedSignal = params.signal;
          params.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
        }),
    );
    const { result } = renderHook(() => useAgentChat({ drawingId: "d1" }));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.sendMessage("draw for a long time");
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(true));
    act(() => result.current.stop());
    await act(async () => pending);

    expect(receivedSignal?.aborted).toBe(true);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.at(-1)?.streaming).toBe(false);
  });

  it("undoes a batch via revertOpsBatch and marks it reverted", async () => {
    streamMock.mockImplementation(async (_params, handlers) => {
      handlers.onOpsApplied?.({
        opsBatchId: "batch-1",
        version: 5,
        revertVersion: 4,
        summaryDelta: [],
      });
      handlers.onDone?.();
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
    expect(selfBatches).toEqual(["batch-1", "batch-2"]);
    expect(result.current.messages[1].batches[0].status).toBe("reverted");
  });

  it("marks the batch revert-failed when the revert call rejects", async () => {
    streamMock.mockImplementation(async (_params, handlers) => {
      handlers.onOpsApplied?.({
        opsBatchId: "batch-1",
        version: 5,
        revertVersion: 4,
        summaryDelta: [],
      });
      handlers.onDone?.();
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
