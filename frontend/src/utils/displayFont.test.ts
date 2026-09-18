import { afterEach, describe, expect, it, vi } from "vitest";

import { configureDisplayFont } from "./displayFont";

const customFontStyle = (): HTMLStyleElement | null =>
  document.querySelector("style[data-excalidash-custom-font]");

afterEach(() => {
  customFontStyle()?.remove();
  document.documentElement.style.removeProperty("--excalidash-display-font");
  vi.unstubAllEnvs();
});

describe("configureDisplayFont", () => {
  it("adds a custom font face", () => {
    vi.stubEnv("VITE_EXCALIDASH_UI_FONT_FAMILY", '"Open Sans"');
    vi.stubEnv(
      "VITE_EXCALIDASH_UI_FONT_URL",
      "https://example.com/open-sans.woff2",
    );

    configureDisplayFont();

    expect(customFontStyle()?.textContent).toContain(
      "font-family: 'Open Sans'; src: url('https://example.com/open-sans.woff2')",
    );
  });

  it("escapes CSS string delimiters and control characters", () => {
    vi.stubEnv(
      "VITE_EXCALIDASH_UI_FONT_FAMILY",
      "Unsafe\\'Font\n} body { display: none; }",
    );
    vi.stubEnv(
      "VITE_EXCALIDASH_UI_FONT_URL",
      "https://example.com/font\\')\n} body { color: red; }",
    );

    configureDisplayFont();

    const css = customFontStyle()?.textContent;
    expect(css).toContain(
      String.raw`font-family: 'Unsafe\\\'Font\a } body { display: none; }'`,
    );
    expect(css).toContain(
      String.raw`src: url('https://example.com/font\\\')\a } body { color: red; }')`,
    );
    expect(css).not.toContain("Font\n}");
    expect(css).not.toContain("font\\')\n}");
  });
});
