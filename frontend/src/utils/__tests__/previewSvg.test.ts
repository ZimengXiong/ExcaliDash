import { describe, expect, it } from "vitest";
import { normalizePreviewSvg, previewHasEmbeddedImages } from "../previewSvg";

describe("normalizePreviewSvg", () => {
  it("adds viewBox from background rect when missing", () => {
    const raw = [
      '<svg width="1456.7890625" height="1213.81640625">',
      '<rect x="0" y="0" width="728.39453125" height="606.908203125" fill="#fff"></rect>',
      '<path d="M0 0 L20 20"></path>',
      "</svg>",
    ].join("");

    const normalized = normalizePreviewSvg(raw);

    expect(normalized).toContain('viewBox="0 0 728.39453125 606.908203125"');
    expect(normalized).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("leaves existing viewBox unchanged", () => {
    const raw = '<svg viewBox="0 0 100 50" width="200" height="100"></svg>';
    const normalized = normalizePreviewSvg(raw);

    expect(normalized).toContain('viewBox="0 0 100 50"');
  });

  it("detects embedded image tags", () => {
    const raw = '<svg><image href="data:image/png;base64,AAAA"></image></svg>';
    expect(previewHasEmbeddedImages(raw)).toBe(true);
    expect(previewHasEmbeddedImages("<svg><rect/></svg>")).toBe(false);
  });

  it("repairs flattened image previews that are hidden by white canvas rect", () => {
    const raw = [
      '<svg viewBox="0 0 500 700" width="1000" height="1400">',
      '<image width="100%" height="100%" href="data:image/png;base64,AAAA"></image>',
      "<defs></defs>",
      '<rect x="0" y="0" width="500" height="700" fill="#ffffff"></rect>',
      "</svg>",
    ].join("");

    const normalized = normalizePreviewSvg(raw);

    expect(normalized).toContain('fill="transparent"');
  });
});
