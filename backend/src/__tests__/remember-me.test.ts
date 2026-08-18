import { describe, expect, it } from "vitest";
import { getRefreshCookieMaxAgeMs } from "../auth/cookies";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("stay signed in", () => {
  it("keeps the existing lifetime when not requested", () => {
    expect(getRefreshCookieMaxAgeMs(false)).toBe(7 * DAY_MS);
    expect(getRefreshCookieMaxAgeMs(undefined)).toBe(7 * DAY_MS);
  });

  it("extends the lifetime when requested", () => {
    expect(getRefreshCookieMaxAgeMs(true)).toBe(30 * DAY_MS);
  });

  it("never shortens the session compared to the default", () => {
    // The checkbox is additive: unticking it must not log people out sooner
    // than they are used to today.
    expect(getRefreshCookieMaxAgeMs(true)).toBeGreaterThan(
      getRefreshCookieMaxAgeMs(false),
    );
  });
});
