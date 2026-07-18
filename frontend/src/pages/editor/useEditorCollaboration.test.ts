import { describe, expect, it, vi } from "vitest";
import { createDemandDrivenRafScheduler } from "./useEditorCollaboration";

describe("cursor RAF scheduling", () => {
  it("coalesces demand and cancels pending work", () => {
    let callback: FrameRequestCallback | undefined;
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb) => { callback = cb; return 1; });
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    const render = vi.fn();
    const scheduler = createDemandDrivenRafScheduler(render);
    scheduler.schedule(); scheduler.schedule();
    expect(raf).toHaveBeenCalledTimes(1);
    scheduler.cancel(); expect(cancel).toHaveBeenCalledWith(1);
    expect(render).not.toHaveBeenCalled();
    raf.mockRestore(); cancel.mockRestore();
  });
});
