import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "../security";

const png = (bytes: number) =>
  `data:image/png;base64,${Buffer.alloc(bytes, 7).toString("base64")}`;

describe("sanitizeSvg inline image fast path", () => {
  it("keeps safe inline images byte-for-byte", () => {
    const dataUrl = png(1024);
    const out = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><image width="10" height="10" href="${dataUrl}"></image></svg>`,
    );
    expect(out).toContain(`href="${dataUrl}"`);
  });

  it("restores xlink:href images as href", () => {
    const dataUrl = png(64);
    const out = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href='${dataUrl}'/></svg>`,
    );
    expect(out).toContain(`href="${dataUrl}"`);
    expect(out).not.toContain("xlink:href");
  });

  it("still drops unsafe data URLs and scripts", () => {
    const out = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html;base64,PHNjcmlwdD4="></image><script>alert(1)</script><use href="${png(8)}"></use></svg>`,
    );
    expect(out).not.toContain("data:text/html");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<use");
  });

  it("does not let content forge restore placeholders", () => {
    const out = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><image href="/api/files/inline-0000000000000000/0"></image><image href="${png(8)}"></image></svg>`,
    );
    expect(out).toContain('href="/api/files/inline-0000000000000000/0"');
    expect(out.match(/data:image\/png/g)).toHaveLength(1);
  });

  it("sanitizes a multi-megabyte preview quickly", () => {
    const images = Array.from(
      { length: 10 },
      (_, i) => `<image x="${i}" href="${png(2 * 1024 * 1024)}"></image>`,
    ).join("");
    const started = performance.now();
    const out = sanitizeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg">${images}</svg>`,
    );
    expect(out.match(/<image/g)).toHaveLength(10);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
