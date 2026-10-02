import { afterEach, describe, expect, it } from "vitest";
import {
  attachCanvasZoomForwarding,
  createTrackpadGestureDetector,
  isLikelyTrackpadWheelEvent,
} from "./canvasZoomForwarding";

/**
 * `isLikelyTrackpadWheelEvent` and `createTrackpadGestureDetector` only read
 * `deltaX`/`deltaY`/`deltaMode`/`timeStamp`, so a plain object cast is enough
 * for the pure-function unit tests below. The integration tests further down
 * use real `WheelEvent`s dispatched through the DOM instead.
 */
const fakeWheelEvent = (
  fields: Partial<
    Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "timeStamp">
  >,
): WheelEvent =>
  ({
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    timeStamp: 0,
    ...fields,
  }) as WheelEvent;

describe("isLikelyTrackpadWheelEvent", () => {
  it("treats a full-magnitude vertical-only tick as a mouse wheel", () => {
    expect(isLikelyTrackpadWheelEvent(fakeWheelEvent({ deltaY: 100 }))).toBe(
      false,
    );
  });

  it("treats a negative full-magnitude vertical tick as a mouse wheel", () => {
    expect(isLikelyTrackpadWheelEvent(fakeWheelEvent({ deltaY: -120 }))).toBe(
      false,
    );
  });

  it("treats a fractional mouse notch at 90% browser zoom as a mouse wheel", () => {
    // Regression test: Chromium scales wheel deltas by the page zoom factor,
    // so a standard 100px notch arrives fractional at any zoom but 100%
    // (~111.1111145 at 90%, trimmed here to keep the literal within double
    // precision). An earlier heuristic keyed on fractional-ness and misread
    // this as a trackpad, silently breaking wheel-to-zoom for zoomed-in mouse
    // users.
    expect(
      isLikelyTrackpadWheelEvent(
        fakeWheelEvent({ deltaY: 111.111114501953, deltaX: 0 }),
      ),
    ).toBe(false);
  });

  it("treats a small integer vertical tick as a trackpad gesture", () => {
    // Regression test: macOS axis-locks a deliberately vertical two-finger
    // pan to deltaX === 0, and its per-event deltas can be whole numbers, so
    // magnitude is the only signal left for issue #265's headline scenario.
    expect(
      isLikelyTrackpadWheelEvent(fakeWheelEvent({ deltaY: 3, deltaX: 0 })),
    ).toBe(true);
  });

  it("treats a nonzero deltaX as a trackpad gesture", () => {
    expect(
      isLikelyTrackpadWheelEvent(fakeWheelEvent({ deltaX: -5, deltaY: 12 })),
    ).toBe(true);
  });

  it("treats a large two-axis delta as a trackpad gesture via deltaX", () => {
    expect(
      isLikelyTrackpadWheelEvent(fakeWheelEvent({ deltaX: 60, deltaY: 200 })),
    ).toBe(true);
  });

  it("treats an all-zero event as a trackpad gesture (below the notch floor)", () => {
    expect(isLikelyTrackpadWheelEvent(fakeWheelEvent({}))).toBe(true);
  });

  it("ignores line-mode events regardless of magnitude", () => {
    expect(
      isLikelyTrackpadWheelEvent(
        fakeWheelEvent({ deltaY: 3, deltaX: 0, deltaMode: 1 }),
      ),
    ).toBe(false);
    expect(
      isLikelyTrackpadWheelEvent(
        fakeWheelEvent({ deltaY: 3, deltaX: 2, deltaMode: 1 }),
      ),
    ).toBe(false);
  });

  it("ignores page-mode events regardless of magnitude", () => {
    expect(
      isLikelyTrackpadWheelEvent(
        fakeWheelEvent({ deltaY: 1, deltaX: 1, deltaMode: 2 }),
      ),
    ).toBe(false);
  });
});

describe("createTrackpadGestureDetector", () => {
  it("classifies the first event on its own merits", () => {
    const isTrackpadGesture = createTrackpadGestureDetector();
    expect(
      isTrackpadGesture(fakeWheelEvent({ deltaY: 3, timeStamp: 100 })),
    ).toBe(true);
  });

  it("reuses a trackpad verdict for a mouse-shaped event in the same gesture", () => {
    const isTrackpadGesture = createTrackpadGestureDetector();
    expect(
      isTrackpadGesture(fakeWheelEvent({ deltaY: 3, timeStamp: 100 })),
    ).toBe(true);
    expect(
      isTrackpadGesture(fakeWheelEvent({ deltaY: 100, timeStamp: 150 })),
    ).toBe(true);
  });

  it("reuses a mouse verdict for a trackpad-shaped event in the same gesture", () => {
    const isTrackpadGesture = createTrackpadGestureDetector();
    expect(
      isTrackpadGesture(fakeWheelEvent({ deltaY: 100, timeStamp: 100 })),
    ).toBe(false);
    expect(
      isTrackpadGesture(fakeWheelEvent({ deltaY: 3, timeStamp: 150 })),
    ).toBe(false);
  });

  it("re-classifies after a gap of at least the gesture timeout", () => {
    const isTrackpadGesture = createTrackpadGestureDetector();
    expect(
      isTrackpadGesture(fakeWheelEvent({ deltaY: 100, timeStamp: 100 })),
    ).toBe(false);
    expect(
      isTrackpadGesture(fakeWheelEvent({ deltaY: 3, timeStamp: 250 })),
    ).toBe(true);
  });

  it("keeps extending the same gesture across a run of close events", () => {
    const isTrackpadGesture = createTrackpadGestureDetector();
    const verdicts = [100, 200, 300, 400].map((timeStamp) =>
      isTrackpadGesture(fakeWheelEvent({ deltaY: 3, deltaX: 1, timeStamp })),
    );
    // Each event is 100ms after the previous one, so the whole run stays a
    // single gesture even though the total span exceeds the timeout.
    expect(verdicts).toEqual([true, true, true, true]);
  });
});

const setupDom = () => {
  const outer = document.createElement("div");
  const excalidrawContainer = document.createElement("div");
  const canvas = document.createElement("canvas");
  excalidrawContainer.appendChild(canvas);
  outer.appendChild(excalidrawContainer);
  document.body.appendChild(outer);
  const receivedByExcalidraw: WheelEvent[] = [];
  // Stand-in for Excalidraw's own handler: bubble phase, passive:false,
  // always preventDefaults canvas-targeted wheel events.
  excalidrawContainer.addEventListener(
    "wheel",
    (e) => {
      receivedByExcalidraw.push(e as WheelEvent);
      e.preventDefault();
    },
    { passive: false },
  );
  return { outer, canvas, receivedByExcalidraw };
};

const wheelEvent = (init: WheelEventInit): WheelEvent =>
  new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaMode: 0,
    ...init,
  });

describe("attachCanvasZoomForwarding", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    document.body.innerHTML = "";
  });

  const attach = (container: HTMLElement) => {
    cleanups.push(attachCanvasZoomForwarding(container));
  };

  it("converts a mouse-shaped wheel event into a ctrl+wheel zoom", () => {
    const { outer, canvas, receivedByExcalidraw } = setupDom();
    attach(outer);

    const event = wheelEvent({ deltaY: 100, deltaX: 0 });
    canvas.dispatchEvent(event);

    expect(receivedByExcalidraw).toHaveLength(1);
    expect(receivedByExcalidraw[0].ctrlKey).toBe(true);
    expect(receivedByExcalidraw[0].deltaY).toBe(100);
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets a trackpad-shaped event through untouched, still cancelled downstream", () => {
    const { outer, canvas, receivedByExcalidraw } = setupDom();
    attach(outer);

    const event = wheelEvent({ deltaY: 3.5, deltaX: -1.25 });
    canvas.dispatchEvent(event);

    expect(receivedByExcalidraw).toHaveLength(1);
    expect(receivedByExcalidraw[0]).toBe(event);
    expect(receivedByExcalidraw[0].ctrlKey).toBe(false);
    expect(receivedByExcalidraw[0].deltaY).toBe(3.5);
    expect(receivedByExcalidraw[0].deltaX).toBe(-1.25);
    // Excalidraw's own handler still cancels it, so there is no double-scroll
    // or overscroll page-bounce even though we skipped preventDefault.
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets shift+wheel with an axis-swapped delta through to native shift-pan", () => {
    // Many browsers move the delta onto deltaX for shift+wheel before the
    // event fires. The horizontal-component signal therefore lets shift+wheel
    // reach Excalidraw's native horizontal pan instead of forcing zoom — an
    // intentional behavior change, documented here so it isn't mistaken for a
    // regression.
    const { outer, canvas, receivedByExcalidraw } = setupDom();
    attach(outer);

    const event = wheelEvent({ deltaX: 100, deltaY: 0, shiftKey: true });
    canvas.dispatchEvent(event);

    expect(receivedByExcalidraw).toHaveLength(1);
    expect(receivedByExcalidraw[0]).toBe(event);
    expect(receivedByExcalidraw[0].ctrlKey).toBe(false);
    expect(receivedByExcalidraw[0].deltaX).toBe(100);
  });

  it("keeps a whole trackpad gesture panning when one event looks mouse-shaped", () => {
    // Regression test for mid-pan zoom jitter: a single event in a long
    // two-finger pan can land at or above the notch floor with deltaX === 0.
    // The gesture latch must hold the trackpad verdict for it.
    const { outer, canvas, receivedByExcalidraw } = setupDom();
    attach(outer);

    const first = wheelEvent({ deltaY: 3, deltaX: 0 });
    canvas.dispatchEvent(first);
    const second = wheelEvent({ deltaY: 100, deltaX: 0 });
    canvas.dispatchEvent(second);

    expect(second.timeStamp - first.timeStamp).toBeLessThan(150);
    expect(receivedByExcalidraw).toHaveLength(2);
    expect(receivedByExcalidraw[0]).toBe(first);
    expect(receivedByExcalidraw[1]).toBe(second);
    expect(receivedByExcalidraw.map((e) => e.ctrlKey)).toEqual([false, false]);
  });

  it("does not intercept ctrl+wheel or meta+wheel", () => {
    const { outer, canvas, receivedByExcalidraw } = setupDom();
    attach(outer);

    const ctrlEvent = wheelEvent({ deltaY: 100, ctrlKey: true });
    canvas.dispatchEvent(ctrlEvent);
    const metaEvent = wheelEvent({ deltaY: 100, metaKey: true });
    canvas.dispatchEvent(metaEvent);

    expect(receivedByExcalidraw).toEqual([ctrlEvent, metaEvent]);
  });

  it("ignores wheel events over the editor UI chrome", () => {
    const { outer, canvas, receivedByExcalidraw } = setupDom();
    const uiWrapper = document.createElement("div");
    uiWrapper.className = "layer-ui__wrapper";
    const uiCanvas = document.createElement("canvas");
    uiWrapper.appendChild(uiCanvas);
    // Nested inside the Excalidraw container so the stand-in handler still
    // sees the event — otherwise this test would pass vacuously.
    canvas.parentElement?.appendChild(uiWrapper);
    attach(outer);

    const event = wheelEvent({ deltaY: 100 });
    uiCanvas.dispatchEvent(event);

    expect(receivedByExcalidraw).toEqual([event]);
    expect(receivedByExcalidraw[0].ctrlKey).toBe(false);
  });

  it("stops intercepting after cleanup", () => {
    const { outer, canvas, receivedByExcalidraw } = setupDom();
    const detach = attachCanvasZoomForwarding(outer);
    detach();

    const event = wheelEvent({ deltaY: 100 });
    canvas.dispatchEvent(event);

    expect(receivedByExcalidraw).toEqual([event]);
    expect(receivedByExcalidraw[0].ctrlKey).toBe(false);
  });

  it("returns a no-op cleanup for a null container", () => {
    expect(() => attachCanvasZoomForwarding(null)()).not.toThrow();
  });
});
