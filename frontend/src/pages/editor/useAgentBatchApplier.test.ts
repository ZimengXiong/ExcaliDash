import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentBatchApplier } from "./useAgentBatchApplier";

// Drive requestAnimationFrame synchronously so the deferred flush runs on demand.
let rafQueue: FrameRequestCallback[] = [];
const flushRaf = () => {
  const queued = rafQueue;
  rafQueue = [];
  queued.forEach((cb) => cb(0));
};

beforeEach(() => {
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const makeApi = () => {
  const scene: any[] = [];
  return {
    updateScene: vi.fn(),
    getSceneElementsIncludingDeleted: vi.fn(() => scene),
  };
};

const setup = (selfSet: Set<string>) => {
  const api = makeApi();
  const args = {
    excalidrawAPI: { current: api },
    isSyncing: { current: false },
    lastSyncedElementOrderSigRef: { current: "" },
    latestElementsRef: { current: [] as readonly any[] },
    computeElementOrderSig: vi.fn(() => "sig"),
    recordElementVersion: vi.fn(),
    selfAgentBatchIdsRef: { current: selfSet },
  };
  const { result } = renderHook(() => useAgentBatchApplier(args as any));
  return { enqueue: result.current, api, args };
};

const element = (id: string) => ({ id, type: "rectangle", version: 2, versionNonce: 1 });

describe("useAgentBatchApplier", () => {
  it("replays a self-originated batch with IMMEDIATELY capture and consumes the id", () => {
    const selfSet = new Set<string>(["b1"]);
    const { enqueue, api } = setup(selfSet);

    act(() => {
      enqueue({ opsBatchId: "b1", elements: [element("r1")], elementOrder: null });
      flushRaf();
    });

    expect(api.updateScene).toHaveBeenCalledTimes(1);
    expect(api.updateScene.mock.calls[0][0].captureUpdate).toBe("IMMEDIATELY");
    // Consumed so a later duplicate delivery is treated as remote.
    expect(selfSet.has("b1")).toBe(false);
  });

  it("replays a peer batch with NEVER capture", () => {
    const { enqueue, api } = setup(new Set());

    act(() => {
      enqueue({ opsBatchId: "other", elements: [element("r2")], elementOrder: null });
      flushRaf();
    });

    expect(api.updateScene.mock.calls[0][0].captureUpdate).toBe("NEVER");
  });

  it("coalesces multiple enqueues into a single animation frame", () => {
    const { enqueue, api } = setup(new Set(["b1"]));

    act(() => {
      enqueue({ opsBatchId: "b1", elements: [element("r1")], elementOrder: null });
      enqueue({ opsBatchId: "b2", elements: [element("r2")], elementOrder: null });
      // Only one rAF scheduled for the pair.
      expect(rafQueue).toHaveLength(1);
      flushRaf();
    });

    // Both batches applied; the self one IMMEDIATELY, the other NEVER.
    expect(api.updateScene).toHaveBeenCalledTimes(2);
    expect(api.updateScene.mock.calls[0][0].captureUpdate).toBe("IMMEDIATELY");
    expect(api.updateScene.mock.calls[1][0].captureUpdate).toBe("NEVER");
  });

  it("records element versions and updates order sig when order changed", () => {
    const { enqueue, args } = setup(new Set());

    act(() => {
      enqueue({
        opsBatchId: "b1",
        elements: [element("r1")],
        elementOrder: ["r1"],
      });
      flushRaf();
    });

    expect(args.recordElementVersion).toHaveBeenCalledTimes(1);
    expect(args.computeElementOrderSig).toHaveBeenCalled();
    expect(args.lastSyncedElementOrderSigRef.current).toBe("sig");
  });
});
