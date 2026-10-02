import { API_URL, getCsrfHeader } from "../../api";

/**
 * Fire a best-effort scene save that survives page unload.
 *
 * The normal axios save pipeline cannot run reliably from a `pagehide`
 * handler (async interceptors, connection teardown), so we use `fetch` with
 * `keepalive: true`, which the browser guarantees to flush even as the
 * document is being discarded. `navigator.sendBeacon` can't be used here
 * because it cannot set the CSRF header nor issue a PUT.
 *
 * Returns true if the request was dispatched, false if it could not be.
 */
export const saveDrawingKeepalive = (
  drawingId: string,
  body: Record<string, unknown>,
): boolean => {
  if (!drawingId || typeof fetch !== "function") return false;
  try {
    const csrf = getCsrfHeader();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (csrf) headers[csrf.name] = csrf.token;
    void fetch(`${API_URL}/drawings/${drawingId}`, {
      method: "PUT",
      credentials: "include",
      keepalive: true,
      headers,
      body: JSON.stringify(body),
    });
    return true;
  } catch {
    return false;
  }
};
