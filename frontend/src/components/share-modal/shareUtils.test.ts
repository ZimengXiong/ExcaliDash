import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDIT_EXPIRY_OPTION,
  EXPIRY_OPTIONS_FOR_EDIT,
  calculateExpiresAt,
  toDatetimeLocalFromIso,
} from "./shareUtils";

describe("share modal expiry helpers", () => {
  it("returns null for explicit never auto-disable", () => {
    expect(calculateExpiresAt("never")).toBeNull();
  });

  it("does not expose never auto-disable for editor links", () => {
    expect(EXPIRY_OPTIONS_FOR_EDIT.map((option) => option.value)).not.toContain(
      "never",
    );
    expect(calculateExpiresAt(DEFAULT_EDIT_EXPIRY_OPTION)).toEqual(
      expect.any(String),
    );
  });

  it("returns an ISO string for preset expiry options", () => {
    const result = calculateExpiresAt("1d");
    expect(typeof result).toBe("string");
    expect(Number.isFinite(new Date(result as string).getTime())).toBe(true);
  });

  it("returns undefined for unknown expiry options", () => {
    expect(calculateExpiresAt("bogus")).toBeUndefined();
  });

  it("converts valid custom datetime-local values to ISO strings", () => {
    const result = calculateExpiresAt("custom", "2030-01-02T03:04");
    expect(typeof result).toBe("string");
    expect(new Date(result as string).getFullYear()).toBe(2030);
  });

  it("ignores blank or near-past custom datetime-local values", () => {
    expect(calculateExpiresAt("custom", "")).toBeUndefined();
    expect(calculateExpiresAt("custom", "2000-01-02T03:04")).toBeUndefined();

    const tooSoon = new Date(Date.now() + 30_000).toISOString();
    expect(
      calculateExpiresAt("custom", toDatetimeLocalFromIso(tooSoon)),
    ).toBeUndefined();
  });
});
