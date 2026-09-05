/**
 * Excalidraw zooms on ctrl/cmd+wheel and pans on plain wheel. This project
 * inverts that on the canvas so a plain wheel zooms: intercept plain wheel
 * events over the canvas (not the editor UI chrome) and re-dispatch them as
 * synthetic ctrl+wheel. Returns a cleanup that detaches the listener.
 *
 * Trackpad two-finger pan gestures also arrive as plain (non-ctrl) wheel
 * events, so without further filtering this inversion would break native
 * trackpad panning. `isLikelyTrackpadWheelEvent` below is a heuristic used to
 * let those events pass through untouched. Pinch-to-zoom gestures already
 * carry `ctrlKey: true` from the browser and are unaffected by any of this —
 * they're excluded by the existing `!event.ctrlKey` check.
 */

/**
 * Best-effort heuristic to distinguish a trackpad two-finger gesture from a
 * physical mouse wheel tick. `WheelEvent` carries no explicit "input device"
 * signal, so this combines two commonly used proxies:
 *
 * 1. Non-zero `deltaX`: a plain mouse wheel is a single vertical axis and
 *    essentially never reports a horizontal component on its own, whereas a
 *    trackpad two-finger pan is inherently a two-axis gesture and commonly
 *    reports some `deltaX` even when the pan is mostly vertical.
 * 2. Fractional (non-integer) `deltaX`/`deltaY`: trackpads report continuous,
 *    high-resolution pixel deltas, while mouse wheels click in fixed, whole
 *    number steps (commonly multiples of 100/120, or a line-height value).
 *
 * Not perfect — some high-resolution/free-spin mouse wheels (e.g. Logitech
 * MX Master) can report fractional deltas and would be misclassified as a
 * trackpad, and a trackpad pan that happens to be purely vertical with
 * whole-number deltas would be misclassified as a mouse wheel. This covers
 * the common cases well enough to restore native trackpad panning without
 * breaking wheel-to-zoom for typical mice.
 */
export const isLikelyTrackpadWheelEvent = (event: WheelEvent): boolean => {
  const hasHorizontalComponent = event.deltaX !== 0;
  const hasFractionalDelta =
    !Number.isInteger(event.deltaX) || !Number.isInteger(event.deltaY);
  return hasHorizontalComponent || hasFractionalDelta;
};

export const attachCanvasZoomForwarding = (
  container: HTMLElement | null,
): (() => void) => {
  if (!container) return () => {};
  const handleWheel = (event: WheelEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const isCanvas = target.tagName?.toLowerCase() === "canvas";
    const isEditorUi =
      target.closest(".layer-ui__wrapper") !== null ||
      target.closest(".App-menu") !== null;
    if (
      isCanvas &&
      !isEditorUi &&
      !event.ctrlKey &&
      !event.metaKey &&
      !(event as any)._isFakeZoom &&
      !isLikelyTrackpadWheelEvent(event)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const zoomEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ctrlKey: true,
      });
      (zoomEvent as any)._isFakeZoom = true;
      target.dispatchEvent(zoomEvent);
    }
    // else: let the event flow through untouched — Excalidraw's native pan
    // handles trackpad two-finger gestures the same way it already handles
    // ctrl/cmd+wheel and pinch-to-zoom.
  };
  container.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: false,
  });
  return () =>
    container.removeEventListener("wheel", handleWheel, { capture: true });
};
