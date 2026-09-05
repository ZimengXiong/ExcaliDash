/**
 * Excalidraw zooms on ctrl/cmd+wheel and pans on plain wheel. This project
 * inverts that on the canvas so a plain wheel zooms: intercept plain wheel
 * events over the canvas (not the editor UI chrome) and re-dispatch them as
 * synthetic ctrl+wheel. Returns a cleanup that detaches the listener.
 *
 * Trackpad two-finger pan gestures also arrive as plain (non-ctrl) wheel
 * events, so without further filtering this inversion would break native
 * trackpad panning. `createTrackpadGestureDetector` below classifies each
 * plain wheel event and lets trackpad-shaped gestures pass through
 * untouched. Excalidraw's own wheel handler (bubble phase, passive:false,
 * on its container inside ours) then receives the un-intercepted event and
 * calls preventDefault on it itself, so skipping our preventDefault here is
 * safe — no double-scroll, no overscroll navigation. Pinch-to-zoom gestures
 * already carry `ctrlKey: true` from the browser and are unaffected by any
 * of this — they're excluded by the `!event.ctrlKey` check below. Shift+wheel
 * from a physical mouse commonly reports its delta on `deltaX` (many
 * browsers swap axes for shift+wheel before the event fires), so it now
 * also passes through to Excalidraw's native shift-pan instead of being
 * forced into zoom — an intentional side effect of the horizontal-component
 * signal below, not a bug.
 */

/**
 * The magnitude (in `DOM_DELTA_PIXEL` units) of one discrete mouse-wheel
 * "notch". Chromium reports wheel deltas in CSS pixels, so this scales with
 * the page's zoom level (a 100px notch becomes ~111px at 90% zoom, ~67px at
 * 150% zoom) — the same scaling applies to a trackpad's much smaller
 * per-event deltas, so the *relative* gap this threshold relies on is
 * preserved across ordinary zoom levels, even though the absolute floor
 * isn't exact at either extreme.
 */
const MOUSE_NOTCH_FLOOR_PX = 40;

/**
 * How long (ms) two consecutive wheel events can be apart and still count
 * as the same physical gesture. Both trackpad pans and mouse-wheel spins
 * fire many events well under 100ms apart; a gap this large means the user
 * lifted their fingers or stopped turning the wheel.
 */
const GESTURE_TIMEOUT_MS = 150;

/**
 * Best-effort per-event heuristic: does this wheel event look like it came
 * from a trackpad rather than a physical mouse wheel?
 *
 * Only `DOM_DELTA_PIXEL` (mode `0`) events are classified — the mode both
 * trackpads and mouse-wheel reporting use on macOS/Chromium/Safari, where
 * issue #265 was reported. Other delta modes (line/page) fall back to
 * `false`, leaving the pre-existing wheel-to-zoom behavior unchanged for
 * them, since the magnitude floor below isn't meaningful in those units.
 *
 * Two independent signals, either sufficient on its own:
 * 1. Non-zero `deltaX`: a physical mouse wheel is single-axis and
 *    essentially never reports a horizontal component by itself, while a
 *    trackpad two-finger pan is inherently two-axis. (macOS axis-locks a
 *    deliberately vertical two-finger pan to `deltaX === 0`, so this alone
 *    doesn't catch that case — see signal 2.)
 * 2. Small magnitude on both axes (`< MOUSE_NOTCH_FLOOR_PX`): a mouse wheel
 *    reports one large, fixed-size step per physical click; a trackpad
 *    reports many small, continuous per-event deltas.
 *
 * Deliberately NOT used: whether the delta is a whole number. A prior
 * version of this heuristic used fractional-ness as the second signal, but
 * Chromium scales `deltaY` by the page's zoom factor, so a standard mouse
 * notch becomes fractional (e.g. ~111.11) at any zoom level other than
 * 100% — that check alone silently broke wheel-to-zoom for zoomed-in mouse
 * users.
 *
 * Not perfect — a fast, hard trackpad flick can occasionally produce a
 * single event at or above the notch floor, and extreme browser zoom
 * levels shift both mouse and trackpad magnitudes together — but combined
 * with the gesture latch below, this covers the common cases without the
 * false positive above.
 */
export const isLikelyTrackpadWheelEvent = (event: WheelEvent): boolean => {
  if (event.deltaMode !== 0) return false;
  const hasHorizontalComponent = event.deltaX !== 0;
  const isSmallMagnitude =
    Math.abs(event.deltaY) < MOUSE_NOTCH_FLOOR_PX &&
    Math.abs(event.deltaX) < MOUSE_NOTCH_FLOOR_PX;
  return hasHorizontalComponent || isSmallMagnitude;
};

/**
 * Wraps `isLikelyTrackpadWheelEvent` with a per-gesture latch. Classifying
 * every wheel event independently means a single event that happens to hit
 * neither signal above — e.g. one event in an axis-locked vertical trackpad
 * pan that lands at or above the notch floor — would flip the verdict and
 * briefly zoom instead of pan mid-gesture. Once a gesture is classified,
 * that verdict is reused for any subsequent event arriving within
 * `GESTURE_TIMEOUT_MS`; a gap that large starts a fresh classification.
 *
 * `lastEventTime` starts at `-Infinity` rather than `0` so the very first
 * event is always classified on its own merits: `event.timeStamp` is
 * measured from the document's time origin, so a wheel event arriving in
 * the first 150ms of the page's life would otherwise be treated as a
 * continuation of a gesture that never happened.
 */
export const createTrackpadGestureDetector = () => {
  let lastEventTime = Number.NEGATIVE_INFINITY;
  let lastVerdict = false;
  return (event: WheelEvent): boolean => {
    const isContinuationOfLastGesture =
      event.timeStamp - lastEventTime < GESTURE_TIMEOUT_MS;
    const verdict = isContinuationOfLastGesture
      ? lastVerdict
      : isLikelyTrackpadWheelEvent(event);
    lastEventTime = event.timeStamp;
    lastVerdict = verdict;
    return verdict;
  };
};

export const attachCanvasZoomForwarding = (
  container: HTMLElement | null,
): (() => void) => {
  if (!container) return () => {};
  const isTrackpadGesture = createTrackpadGestureDetector();
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
      !isTrackpadGesture(event)
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
    // else: leave the event alone — Excalidraw's own wheel handler (bubble
    // phase, passive:false, on its container inside ours) receives it and
    // calls preventDefault itself. Covers trackpad gestures, shift+wheel
    // horizontal pan, ctrl/cmd+wheel, and pinch-to-zoom.
  };
  container.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: false,
  });
  return () =>
    container.removeEventListener("wheel", handleWheel, { capture: true });
};
