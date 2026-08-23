import { describe, expect, it } from "vitest";
import { userPreferencesSchema } from "../auth/schemas";

describe("userPreferencesSchema", () => {
  it("accepts a full valid preferences payload", () => {
    const parsed = userPreferencesSchema.safeParse({
      theme: "dark",
      dashboardSortField: "name",
      dashboardSortDirection: "asc",
      language: "fr-FR",
      gridStep: 8,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a gridStep-only partial update", () => {
    const parsed = userPreferencesSchema.partial().safeParse({ gridStep: 10 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.gridStep).toBe(10);
    }
  });

  it("rejects a non-integer gridStep", () => {
    const parsed = userPreferencesSchema.partial().safeParse({ gridStep: 2.5 });
    expect(parsed.success).toBe(false);
  });

  it("rejects an out-of-range gridStep", () => {
    expect(
      userPreferencesSchema.partial().safeParse({ gridStep: 0 }).success,
    ).toBe(false);
    expect(
      userPreferencesSchema.partial().safeParse({ gridStep: 101 }).success,
    ).toBe(false);
  });

  it("accepts a language-only partial update", () => {
    const parsed = userPreferencesSchema.partial().safeParse({
      language: "zh-CN",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.language).toBe("zh-CN");
    }
  });

  it("trims surrounding whitespace on language", () => {
    const parsed = userPreferencesSchema.partial().safeParse({
      language: "  nb-NO  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.language).toBe("nb-NO");
    }
  });

  it("rejects an empty language string", () => {
    const parsed = userPreferencesSchema.partial().safeParse({ language: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an over-long language string", () => {
    const parsed = userPreferencesSchema.partial().safeParse({
      language: "x".repeat(36),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const parsed = userPreferencesSchema.safeParse({ bogus: true });
    expect(parsed.success).toBe(false);
  });
});
