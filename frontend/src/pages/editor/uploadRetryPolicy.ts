// Retry policy for per-file image uploads (see issue #307).
//
// The upload hook rescans the live file set on a short interval, so without a
// policy a persistently failing upload (e.g. a 401 for a link-share editor
// without an account) is re-sent forever and exhausts the API rate limit.

export const UPLOAD_BACKOFF_BASE_MS = 1_000;
export const UPLOAD_BACKOFF_MAX_MS = 60_000;

/**
 * - `auth`: 401/403. The caller is not allowed to use the upload endpoint at
 *   all, so no file will succeed; stop uploading for this drawing session.
 * - `permanent`: any other non-retryable 4xx (e.g. 413 too large, 400, 422).
 *   Resending the same bytes cannot help; stop retrying that file.
 * - `retryable`: network errors, timeouts, 408, 429 and 5xx. Retry with
 *   exponential backoff.
 */
export type UploadFailureKind = "auth" | "permanent" | "retryable";

const getResponse = (
  error: unknown,
): { status?: unknown; headers?: unknown } | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const response = (error as { response?: unknown }).response;
  return typeof response === "object" && response !== null
    ? (response as { status?: unknown; headers?: unknown })
    : undefined;
};

export const classifyUploadError = (error: unknown): UploadFailureKind => {
  const status = getResponse(error)?.status;
  if (typeof status !== "number") return "retryable"; // no response: network/timeout
  if (status === 401 || status === 403) return "auth";
  if (status === 408 || status === 429) return "retryable";
  if (status >= 400 && status < 500) return "permanent";
  return "retryable";
};

/** Delay before the next attempt after `failureCount` (>= 1) consecutive failures. */
export const getUploadBackoffMs = (failureCount: number): number => {
  const exponent = Math.max(0, Math.min(failureCount, 32) - 1);
  return Math.min(
    UPLOAD_BACKOFF_MAX_MS,
    UPLOAD_BACKOFF_BASE_MS * 2 ** exponent,
  );
};

const readRetryAfterMs = (error: unknown): number | null => {
  const headers = getResponse(error)?.headers;
  if (typeof headers !== "object" || headers === null) return null;
  const raw =
    typeof (headers as { get?: unknown }).get === "function"
      ? (headers as { get: (name: string) => unknown }).get("retry-after")
      : (headers as Record<string, unknown>)["retry-after"];
  const seconds = typeof raw === "string" ? Number(raw) : raw;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return seconds * 1000;
};

/**
 * Backoff for a retryable failure: exponential, capped, and never shorter than
 * a server-provided `Retry-After` (itself capped so one odd header can't park
 * an upload for hours).
 */
export const getUploadRetryDelayMs = (
  failureCount: number,
  error?: unknown,
): number => {
  const backoff = getUploadBackoffMs(failureCount);
  const retryAfter = readRetryAfterMs(error);
  if (retryAfter === null) return backoff;
  return Math.max(backoff, Math.min(retryAfter, UPLOAD_BACKOFF_MAX_MS));
};
