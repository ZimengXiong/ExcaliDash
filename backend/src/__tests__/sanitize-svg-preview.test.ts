import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "../security";

// B12: the dashboard preview sanitizer must keep S3-mode image hrefs so
// thumbnails don't lose every image. It accepts svg+xml data URLs and
// same-origin `/api/files/...` references in addition to raster data URLs,
// while still stripping dangerous hrefs.
describe("sanitizeSvg preview image hrefs (S3 rehydration)", () => {
  const wrap = (image: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${image}</svg>`;

  it("preserves an svg+xml base64 data URL image", () => {
    const href = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    const out = sanitizeSvg(
      wrap(`<image x="0" y="0" width="100" height="100" href="${href}" />`),
    );
    expect(out).toContain("<image");
    expect(out).toContain(href);
  });

  it("preserves a same-origin /api/files reference", () => {
    const href = "/api/files/drawing_1/file_abc";
    const out = sanitizeSvg(
      wrap(`<image x="0" y="0" width="100" height="100" href="${href}" />`),
    );
    expect(out).toContain("<image");
    expect(out).toContain(href);
  });

  it("still preserves a raster png data URL", () => {
    const href =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const out = sanitizeSvg(
      wrap(`<image x="0" y="0" width="1" height="1" href="${href}" />`),
    );
    expect(out).toContain(href);
  });

  it("strips a javascript: href", () => {
    const out = sanitizeSvg(
      wrap(`<image x="0" y="0" width="1" height="1" href="javascript:alert(1)" />`),
    );
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<image");
  });

  it("strips an arbitrary cross-path url that is not a file reference", () => {
    const out = sanitizeSvg(
      wrap(`<image x="0" y="0" width="1" height="1" href="/etc/passwd" />`),
    );
    expect(out).not.toContain("/etc/passwd");
    expect(out).not.toContain("<image");
  });
});
