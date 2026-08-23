/**
 * Regression tests for B1 / B8 (batch A — sanitizer/images backend).
 *
 * The sanitizer must NEVER truncate or blank an image dataURL:
 *  - a valid `data:image/<allowed>;base64,...` under the size cap is kept verbatim
 *    (previously anything not on the hardcoded allowlist — e.g. avif/bmp, or an SVG
 *    whose base64 pushed the dataURL past 1000 chars — was silently sliced to 1000);
 *  - an over-cap image is rejected with a 413-carrying error naming the fileId
 *    (previously it was blanked to "" and the save "succeeded", losing the image);
 *  - a malformed/unsupported dataURL is rejected with a 400 naming the fileId.
 *
 * Boundary is exercised at exactly the historical 1000-char slice point for every
 * MIME type the S3 pipeline accepts, including avif and bmp which used to be missing.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  sanitizeDrawingData,
  configureSecuritySettings,
  resetSecuritySettings,
  DrawingSanitizationError,
} from "../security";
import { sanitizeDrawingUpdateData } from "../index";

const MIME_TYPES = [
  "image/svg+xml",
  "image/avif",
  "image/bmp",
  "image/webp",
  "image/png",
];

const makeDataUrl = (mime: string, totalLength: number): string => {
  const prefix = `data:${mime};base64,`;
  const body = "A".repeat(Math.max(0, totalLength - prefix.length));
  return prefix + body;
};

const runFile = (dataURL: string, fileId = "file-1") =>
  sanitizeDrawingData({
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: { [fileId]: { id: fileId, dataURL } },
  });

const catchError = (fn: () => void): unknown => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
};

describe("sanitizer image dataURL handling (B1/B8)", () => {
  beforeEach(() => {
    resetSecuritySettings();
  });

  describe.each(MIME_TYPES)("MIME %s at the 1000-char boundary", (mime) => {
    it("keeps a dataURL of exactly the cap length verbatim (no truncation)", () => {
      configureSecuritySettings({ maxDataUrlSize: 1000 });
      const dataURL = makeDataUrl(mime, 1000);
      expect(dataURL.length).toBe(1000);
      const result = runFile(dataURL);
      const files = result.files as Record<string, any>;
      expect(files["file-1"].dataURL).toBe(dataURL);
      expect(files["file-1"].dataURL.length).toBe(1000);
    });

    it("rejects a dataURL one byte over the cap with 413 + fileId (not blanked)", () => {
      configureSecuritySettings({ maxDataUrlSize: 1000 });
      const dataURL = makeDataUrl(mime, 1001);
      expect(dataURL.length).toBe(1001);
      const error = catchError(() => runFile(dataURL));
      expect(error).toBeInstanceOf(DrawingSanitizationError);
      expect((error as DrawingSanitizationError).statusCode).toBe(413);
      expect((error as DrawingSanitizationError).fileId).toBe("file-1");
    });

    it("keeps a large (well over the old 1000 slice) dataURL verbatim under a generous cap", () => {
      // Default 10MB cap; body far exceeds the historical 1000-char slice point.
      const dataURL = makeDataUrl(mime, 5000);
      const result = runFile(dataURL);
      const files = result.files as Record<string, any>;
      expect(files["file-1"].dataURL).toBe(dataURL);
    });
  });

  it("rejects an unsupported image MIME with 400 + fileId", () => {
    const error = catchError(() =>
      runFile("data:image/tiff;base64,QUFBQQ==", "tiff-file"),
    );
    expect(error).toBeInstanceOf(DrawingSanitizationError);
    expect((error as DrawingSanitizationError).statusCode).toBe(400);
    expect((error as DrawingSanitizationError).fileId).toBe("tiff-file");
  });

  it("rejects a non-base64 image dataURL (utf8 svg) with 400 + fileId", () => {
    const error = catchError(() =>
      runFile("data:image/svg+xml;utf8,<svg/>", "svg-utf8"),
    );
    expect(error).toBeInstanceOf(DrawingSanitizationError);
    expect((error as DrawingSanitizationError).statusCode).toBe(400);
    expect((error as DrawingSanitizationError).fileId).toBe("svg-utf8");
  });

  it("keeps an already-uploaded /api/files reference unchanged", () => {
    const ref = "/api/files/drawing-1/file-1";
    const result = runFile(ref);
    const files = result.files as Record<string, any>;
    expect(files["file-1"].dataURL).toBe(ref);
  });

  it("keeps an empty dataURL as-is (does not reject tombstones)", () => {
    const result = runFile("");
    const files = result.files as Record<string, any>;
    expect(files["file-1"].dataURL).toBe("");
  });

  it("surfaces the 413 through the update-schema sanitizer helper (index.ts wiring)", () => {
    configureSecuritySettings({ maxDataUrlSize: 1000 });
    const dataURL = makeDataUrl("image/png", 1001);
    const error = catchError(() =>
      sanitizeDrawingUpdateData({
        files: { "file-1": { id: "file-1", dataURL } },
      }),
    );
    expect(error).toBeInstanceOf(DrawingSanitizationError);
    expect((error as DrawingSanitizationError).statusCode).toBe(413);
    expect((error as DrawingSanitizationError).fileId).toBe("file-1");
  });
});
