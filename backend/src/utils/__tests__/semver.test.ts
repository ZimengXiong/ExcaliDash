import { describe, expect, it } from "vitest";
import { compareSemver, parseSemver } from "../semver";

describe("semver utils", () => {
  it("parses v-prefixed tags", () => {
    expect(parseSemver("v0.4.11")).toMatchObject({
      major: 0,
      minor: 4,
      patch: 11,
      prerelease: [],
    });
  });

  it("orders prerelease lower than stable", () => {
    const stable = parseSemver("0.4.11")!;
    const dev = parseSemver("0.4.11-dev")!;
    expect(compareSemver(dev, stable)).toBeLessThan(0);
    expect(compareSemver(stable, dev)).toBeGreaterThan(0);
  });

  it("orders higher patch even if prerelease", () => {
    const a = parseSemver("0.4.12-dev")!;
    const b = parseSemver("0.4.11")!;
    expect(compareSemver(a, b)).toBeGreaterThan(0);
  });

  it("compares prerelease numeric segments", () => {
    const a = parseSemver("1.0.0-beta.2")!;
    const b = parseSemver("1.0.0-beta.10")!;
    expect(compareSemver(a, b)).toBeLessThan(0);
  });
});
