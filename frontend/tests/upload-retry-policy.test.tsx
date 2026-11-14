import { describe, expect, it } from "vitest";
import {
  UPLOAD_BACKOFF_BASE_MS,
  UPLOAD_BACKOFF_MAX_MS,
  classifyUploadError,
  getUploadBackoffMs,
  getUploadRetryDelayMs,
} from "../src/pages/editor/uploadRetryPolicy";

const httpError = (status: number, headers?: unknown) => ({
  response: { status, headers },
});

describe("classifyUploadError", () => {
  it("treats 401 and 403 as auth failures", () => {
    expect(classifyUploadError(httpError(401))).toBe("auth");
    expect(classifyUploadError(httpError(403))).toBe("auth");
  });

  it("treats other 4xx as permanent, except 408 and 429", () => {
    for (const status of [400, 404, 409, 413, 415, 422]) {
      expect(classifyUploadError(httpError(status))).toBe("permanent");
    }
    expect(classifyUploadError(httpError(408))).toBe("retryable");
    expect(classifyUploadError(httpError(429))).toBe("retryable");
  });

  it("treats 5xx and errors without a response as retryable", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyUploadError(httpError(status))).toBe("retryable");
    }
    expect(classifyUploadError(new Error("Network Error"))).toBe("retryable");
    expect(classifyUploadError(undefined)).toBe("retryable");
    expect(classifyUploadError("boom")).toBe("retryable");
  });
});

describe("getUploadBackoffMs", () => {
  it("doubles from the base delay", () => {
    expect(getUploadBackoffMs(1)).toBe(UPLOAD_BACKOFF_BASE_MS);
    expect(getUploadBackoffMs(2)).toBe(UPLOAD_BACKOFF_BASE_MS * 2);
    expect(getUploadBackoffMs(3)).toBe(UPLOAD_BACKOFF_BASE_MS * 4);
  });

  it("is capped, even for huge failure counts", () => {
    expect(getUploadBackoffMs(30)).toBe(UPLOAD_BACKOFF_MAX_MS);
    expect(getUploadBackoffMs(10_000)).toBe(UPLOAD_BACKOFF_MAX_MS);
  });
});

describe("getUploadRetryDelayMs", () => {
  it("uses the backoff when there is no Retry-After", () => {
    expect(getUploadRetryDelayMs(2, httpError(429))).toBe(2000);
    expect(getUploadRetryDelayMs(2)).toBe(2000);
  });

  it("honors Retry-After from plain and Headers-like objects, never below the backoff", () => {
    expect(
      getUploadRetryDelayMs(1, httpError(429, { "retry-after": "20" })),
    ).toBe(20_000);
    expect(
      getUploadRetryDelayMs(
        1,
        httpError(429, {
          get: (n: string) => (n === "retry-after" ? "15" : null),
        }),
      ),
    ).toBe(15_000);
    expect(
      getUploadRetryDelayMs(4, httpError(429, { "retry-after": "1" })),
    ).toBe(8000);
  });

  it("caps Retry-After and ignores garbage values", () => {
    expect(
      getUploadRetryDelayMs(1, httpError(429, { "retry-after": "86400" })),
    ).toBe(UPLOAD_BACKOFF_MAX_MS);
    expect(
      getUploadRetryDelayMs(1, httpError(429, { "retry-after": "soon" })),
    ).toBe(UPLOAD_BACKOFF_BASE_MS);
  });
});
