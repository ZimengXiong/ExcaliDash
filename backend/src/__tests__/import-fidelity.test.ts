/**
 * Regression tests for B13 (batch J — import fidelity), issue #205.
 *
 * Importing an Excalidraw drawing must preserve, not corrupt, its content:
 *  - arrow elements keep `startArrowhead`/`endArrowhead` (they flow through the
 *    element schema's `.passthrough()` — this test guards against a future
 *    allowlist that would silently drop them);
 *  - custom fonts survive whether `fontFamily` is a numeric id beyond the
 *    built-in range or a string font name (previously `z.number()` rejected the
 *    string, failing the whole drawing's validation);
 *  - literal angle-bracket / ampersand text in an element is kept verbatim
 *    (previously DOMPurify stripped `<value>` and entity-encoded `<`/`&`,
 *    turning `3 < 4 & ok` into `3 &lt; 4 &amp; ok`).
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeDrawingData,
  sanitizeElementText,
  sanitizeText,
  validateImportedDrawing,
} from "../security";

const importedDrawing = () => ({
  elements: [
    {
      id: "arrow-1",
      type: "arrow",
      x: 0,
      y: 0,
      strokeColor: "#1e1e1e",
      startArrowhead: "dot",
      endArrowhead: "triangle",
    },
    {
      id: "text-string-font",
      type: "text",
      text: "value is <value> and 3 < 4 & ok",
      fontFamily: "Comic Shanns",
      fontSize: 20,
    },
    {
      id: "text-numeric-font",
      type: "text",
      text: "custom numeric font",
      fontFamily: 137,
      fontSize: 16,
    },
  ],
  appState: { viewBackgroundColor: "#ffffff", currentItemFontFamily: 137 },
  files: {},
  preview: null as string | null,
});

describe("import fidelity (B13)", () => {
  it("keeps arrowhead properties on arrow elements", () => {
    const { elements } = sanitizeDrawingData(importedDrawing());
    const arrow = elements.find((e: any) => e.id === "arrow-1") as any;
    expect(arrow.startArrowhead).toBe("dot");
    expect(arrow.endArrowhead).toBe("triangle");
  });

  it("preserves a string custom fontFamily and a large numeric one", () => {
    const { elements, appState } = sanitizeDrawingData(importedDrawing());
    const stringFont = elements.find((e: any) => e.id === "text-string-font") as any;
    const numericFont = elements.find((e: any) => e.id === "text-numeric-font") as any;
    expect(stringFont.fontFamily).toBe("Comic Shanns");
    expect(numericFont.fontFamily).toBe(137);
    // a custom font id beyond the built-in range must not be rejected in appState
    expect((appState as any).currentItemFontFamily).toBe(137);
  });

  it("does not strip or entity-encode literal angle brackets in element text", () => {
    const { elements } = sanitizeDrawingData(importedDrawing());
    const textEl = elements.find((e: any) => e.id === "text-string-font") as any;
    expect(textEl.text).toBe("value is <value> and 3 < 4 & ok");
  });

  it("validates a drawing that uses arrowheads, a custom font, and bracket text", () => {
    expect(validateImportedDrawing(importedDrawing())).toBe(true);
  });

  it("sanitizeElementText keeps markup-like text verbatim but strips control chars", () => {
    expect(sanitizeElementText("literal <value> & 3 < 4")).toBe("literal <value> & 3 < 4");
    expect(sanitizeElementText("a\x00b\x07c")).toBe("abc");
    expect(sanitizeElementText("keep\ttabs\nand newlines")).toBe("keep\ttabs\nand newlines");
    expect(sanitizeElementText(123 as unknown)).toBe("");
    expect(sanitizeElementText("abcdef", 3)).toBe("abc");
  });

  it("still HTML-sanitizes non-element text (names/metadata) via sanitizeText", () => {
    // sanitizeText remains the strict HTML-context sanitizer for names etc.
    expect(sanitizeText("<script>alert(1)</script>hello")).toBe("hello");
  });
});
