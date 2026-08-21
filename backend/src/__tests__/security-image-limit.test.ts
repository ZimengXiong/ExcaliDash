import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureSecuritySettings,
  resetSecuritySettings,
  sanitizeDrawingData,
} from "../security";

describe("image data URL storage limits", () => {
  beforeEach(() => {
    resetSecuritySettings();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("rejects oversized images instead of returning an empty payload", () => {
    configureSecuritySettings({ maxDataUrlSize: 100 });

    expect(() =>
      sanitizeDrawingData({
        elements: [],
        appState: {},
        files: {
          image: {
            id: "image",
            mimeType: "image/png",
            dataURL: `data:image/png;base64,${"A".repeat(200)}`,
          },
        },
      }),
    ).toThrow("Invalid or malicious drawing data detected");
  });

  it("continues to preserve image data below the configured limit", () => {
    configureSecuritySettings({ maxDataUrlSize: 1_000 });
    const dataURL = `data:image/png;base64,${"A".repeat(200)}`;

    const result = sanitizeDrawingData({
      elements: [],
      appState: {},
      files: {
        image: { id: "image", mimeType: "image/png", dataURL },
      },
    });

    expect(result.files.image.dataURL).toBe(dataURL);
  });
});
