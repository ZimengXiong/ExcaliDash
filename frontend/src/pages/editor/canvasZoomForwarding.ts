/**
 * Excalidraw zooms on ctrl/cmd+wheel and pans on plain wheel. This project
 * inverts that on the canvas so a plain wheel zooms: intercept plain wheel
 * events over the canvas (not the editor UI chrome) and re-dispatch them as
 * synthetic ctrl+wheel. Returns a cleanup that detaches the listener.
 */
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
      !(event as any)._isFakeZoom
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
  };
  container.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: false,
  });
  return () =>
    container.removeEventListener("wheel", handleWheel, { capture: true });
};
