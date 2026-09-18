import { describe, expect, it } from "vitest";
import { sanitizeDrawingUpdateData } from "../index";

describe("sanitizeDrawingUpdateData regression", () => {
  it("does not inject empty scene fields for preview-only updates", () => {
    const payload: {
      preview?: string | null;
      elements?: unknown[];
      appState?: Record<string, unknown>;
      files?: Record<string, unknown>;
    } = {
      preview: '<svg><rect width="10" height="10"/></svg>',
    };

    const ok = sanitizeDrawingUpdateData(payload);
    expect(ok).toBe(true);
    expect(typeof payload.preview).toBe("string");
    expect(String(payload.preview)).toContain("<svg");
    expect(payload.elements).toBeUndefined();
    expect(payload.appState).toBeUndefined();
    expect(payload.files).toBeUndefined();
  });

  it("still sanitizes scene fields when scene data is provided", () => {
    const payload: {
      preview?: string | null;
      elements?: any[];
      appState?: Record<string, unknown>;
      files?: Record<string, unknown>;
    } = {
      elements: [
        {
          id: "el-1",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
      preview: "<svg/>",
    };

    const ok = sanitizeDrawingUpdateData(payload);
    expect(ok).toBe(true);
    expect(Array.isArray(payload.elements)).toBe(true);
    expect(typeof payload.appState).toBe("object");
  });
});
