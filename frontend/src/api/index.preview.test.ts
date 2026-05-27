import { describe, expect, it } from "vitest";
import { getDrawingPreviewUrl, API_URL } from "../api";

describe("getDrawingPreviewUrl", () => {
  it("returns a properly encoded preview URL for a drawing id", () => {
    const id = "drawing-abc123";
    const url = getDrawingPreviewUrl(id);

    expect(url).toBe(`${API_URL}/drawings/drawing-abc123/preview`);
    expect(url).toContain("/drawings/");
    expect(url).toContain("/preview");
    expect(url.startsWith(API_URL)).toBe(true);
  });

  it("encodes special characters in drawing ids", () => {
    const id = "drawing/with spaces";
    const url = getDrawingPreviewUrl(id);

    expect(url).toBe(`${API_URL}/drawings/${encodeURIComponent(id)}/preview`);
    expect(url).toContain(encodeURIComponent("drawing/with spaces"));
    expect(url.startsWith(API_URL)).toBe(true);
  });

  it("encodes ids with special URI characters like # and ?", () => {
    const id = "drawing#1?special";
    const url = getDrawingPreviewUrl(id);

    // # and ? must be URI-encoded in the path segment
    expect(url).toBe(`${API_URL}/drawings/${encodeURIComponent(id)}/preview`);
    expect(url).not.toContain("#");
    expect(url).not.toContain("?");
    expect(url).toContain("%23");
    expect(url).toContain("%3F");
  });
});
