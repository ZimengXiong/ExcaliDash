import { describe, expect, it, vi } from "vitest";
import { attachCanvasZoomForwarding } from "./canvasZoomForwarding";

describe("attachCanvasZoomForwarding", () => {
  it("forwards a plain canvas wheel event as ctrl+wheel at the cursor", () => {
    const container = document.createElement("div");
    const canvas = document.createElement("canvas");
    container.append(canvas);
    const dispatched: WheelEvent[] = [];
    canvas.addEventListener("wheel", (event) => dispatched.push(event));
    const detach = attachCanvasZoomForwarding(container);

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 41,
      clientY: 73,
      deltaX: 2,
      deltaY: 9,
    });
    canvas.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      ctrlKey: true,
      clientX: 41,
      clientY: 73,
      deltaX: 2,
      deltaY: 9,
    });

    detach();
  });

  it("leaves modified and non-canvas wheel events unchanged", () => {
    const container = document.createElement("div");
    const canvas = document.createElement("canvas");
    const editorUi = document.createElement("div");
    editorUi.className = "layer-ui__wrapper";
    container.append(canvas, editorUi);
    const canvasListener = vi.fn();
    const uiListener = vi.fn();
    canvas.addEventListener("wheel", canvasListener);
    editorUi.addEventListener("wheel", uiListener);
    const detach = attachCanvasZoomForwarding(container);

    const modifiedWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    });
    canvas.dispatchEvent(modifiedWheel);
    const uiWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
    });
    editorUi.dispatchEvent(uiWheel);

    expect(canvasListener).toHaveBeenCalledTimes(1);
    expect(modifiedWheel.defaultPrevented).toBe(false);
    expect(uiListener).toHaveBeenCalledTimes(1);
    expect(uiWheel.defaultPrevented).toBe(false);

    detach();
  });

  it("stops forwarding after cleanup", () => {
    const container = document.createElement("div");
    const canvas = document.createElement("canvas");
    container.append(canvas);
    const listener = vi.fn();
    canvas.addEventListener("wheel", listener);
    const detach = attachCanvasZoomForwarding(container);
    detach();

    canvas.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
