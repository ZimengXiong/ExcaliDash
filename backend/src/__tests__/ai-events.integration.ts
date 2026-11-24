import { describe, expect, it, vi } from "vitest";
import { createAiEventHub } from "../ai/events";

describe("AI conversation event hub", () => {
  it("publishes saved messages and clears only to subscribed boards", () => {
    const hub = createAiEventHub();
    const listener = vi.fn();
    const otherBoardListener = vi.fn();
    const unsubscribe = hub.subscribe("board", listener);
    hub.subscribe("other-board", otherBoardListener);

    hub.publish("board", {
      type: "messages",
      messages: [{ id: "message", role: "user" }],
    });
    hub.publish("board", { type: "cleared" });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toEqual({ type: "cleared" });
    expect(otherBoardListener).not.toHaveBeenCalled();

    unsubscribe();
    hub.publish("board", { type: "cleared" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("shares active job reasoning and rejects duplicate jobs", () => {
    const hub = createAiEventHub();
    const listener = vi.fn();
    hub.subscribe("board", listener);
    const job = hub.startJob("board")!;

    expect(hub.startJob("board")).toBeNull();
    hub.appendReasoning("board", job.id, "Thinking");
    expect(hub.getActiveJob("board")?.reasoning).toBe("Thinking");
    expect(listener).toHaveBeenLastCalledWith({
      type: "status",
      status: "working",
      jobId: job.id,
      reasoning: "Thinking",
    });

    hub.finishJob("board", job.id);
    expect(hub.getActiveJob("board")).toBeNull();
    expect(listener).toHaveBeenLastCalledWith({
      type: "status",
      status: "idle",
      jobId: job.id,
    });
  });
});
