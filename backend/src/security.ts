import { z } from "zod";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

// Create a DOM environment for DOMPurify (Node.js compatibility)
const window = new JSDOM("").window;
const purify = DOMPurify(window);

export const sanitizeHtml = (input: string): string => {
  if (typeof input !== "string") return "";

  return purify
    .sanitize(input, {
      ALLOWED_TAGS: ["b", "i", "u", "em", "strong", "p", "br", "span", "div"],
      ALLOWED_ATTR: [],
      FORBID_TAGS: [
        "script",
        "iframe",
        "object",
        "embed",
        "link",
        "style",
        "form",
        "input",
        "button",
        "select",
        "textarea",
        "svg",
        "foreignObject",
      ],
      FORBID_ATTR: [
        "onload",
        "onclick",
        "onerror",
        "onmouseover",
        "onfocus",
        "onblur",
        "onchange",
        "onsubmit",
        "onreset",
        "onkeydown",
        "onkeyup",
        "onkeypress",
        "href",
        "src",
        "action",
        "formaction",
      ],
      KEEP_CONTENT: true,
    })
    .trim();
};

export const sanitizeSvg = (svgContent: string): string => {
  if (typeof svgContent !== "string") return "";

  return purify
    .sanitize(svgContent, {
      ALLOWED_TAGS: [
        "svg",
        "g",
        "rect",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
        "path",
        "text",
        "tspan",
      ],
      ALLOWED_ATTR: [
        "x",
        "y",
        "width",
        "height",
        "cx",
        "cy",
        "r",
        "rx",
        "ry",
        "x1",
        "y1",
        "x2",
        "y2",
        "points",
        "d",
        "fill",
        "stroke",
        "stroke-width",
        "opacity",
        "transform",
        "font-size",
        "font-family",
        "text-anchor",
        "dominant-baseline",
      ],
      FORBID_TAGS: [
        "script",
        "foreignObject",
        "iframe",
        "object",
        "embed",
        "use",
        "image",
        "style",
        "link",
        "defs",
        "symbol",
        "marker",
        "clipPath",
        "mask",
        "filter",
      ],
      FORBID_ATTR: [
        "onload",
        "onclick",
        "onerror",
        "onmouseover",
        "onfocus",
        "onblur",
        "href",
        "xlink:href",
        "src",
        "action",
        "style",
        "class",
        "id",
      ],
      KEEP_CONTENT: true,
    })
    .trim();
};

export const sanitizeText = (
  input: unknown,
  maxLength: number = 1000
): string => {
  if (typeof input !== "string") return "";

  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  const truncated = cleaned.slice(0, maxLength);

  return purify
    .sanitize(truncated, {
      ALLOWED_TAGS: ["b", "i", "u", "em", "strong", "br", "span"],
      ALLOWED_ATTR: [],
      FORBID_TAGS: [
        "script",
        "iframe",
        "object",
        "embed",
        "link",
        "style",
        "form",
        "input",
        "button",
        "select",
        "textarea",
        "svg",
        "foreignObject",
      ],
      FORBID_ATTR: [
        "onload",
        "onclick",
        "onerror",
        "onmouseover",
        "onfocus",
        "onblur",
        "onchange",
        "onsubmit",
        "onreset",
        "onkeydown",
        "onkeyup",
        "onkeypress",
        "href",
        "src",
        "action",
        "formaction",
        "style",
      ],
      KEEP_CONTENT: true,
    })
    .trim();
};

export const sanitizeUrl = (url: unknown): string => {
  if (typeof url !== "string") return "";

  const trimmed = url.trim();

  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return "";
  }

  try {
    if (/^(https?:\/\/|mailto:|\/|\.\/|\.\.\/)/i.test(trimmed)) {
      return trimmed;
    }
    return "";
  } catch {
    return "";
  }
};

export const elementSchema = z
  .object({
    id: z.string().min(1).max(200).optional().nullable(),
    type: z.string().optional().nullable(),
    x: z.number().optional().nullable(),
    y: z.number().optional().nullable(),
    width: z.number().optional().nullable(),
    height: z.number().optional().nullable(),
    angle: z.number().optional().nullable(),
    strokeColor: z.string().optional().nullable(),
    backgroundColor: z.string().optional().nullable(),
    fillStyle: z.string().optional().nullable(),
    strokeWidth: z.number().optional().nullable(),
    strokeStyle: z.string().optional().nullable(),
    roundness: z.any().optional().nullable(),
    boundElements: z.array(z.any()).optional().nullable(),
    groupIds: z.array(z.string()).optional().nullable(),
    frameId: z.string().optional().nullable(),
    seed: z.number().optional().nullable(),
    version: z.number().optional().nullable(),
    versionNonce: z.number().optional().nullable(),
    isDeleted: z.boolean().optional().nullable(),
    opacity: z.number().optional().nullable(),
    link: z.string().optional().nullable(),
    locked: z.boolean().optional().nullable(),
    text: z.string().optional().nullable(),
    fontSize: z.number().optional().nullable(),
    fontFamily: z.number().optional().nullable(),
    textAlign: z.string().optional().nullable(),
    verticalAlign: z.string().optional().nullable(),
    customData: z.record(z.string(), z.any()).optional().nullable(),
  })
  .passthrough()
  .transform((element) => {
    const sanitized = { ...element };

    if (typeof sanitized.text === "string") {
      sanitized.text = sanitizeText(sanitized.text, 5000);
    }

    if (typeof sanitized.link === "string") {
      sanitized.link = sanitizeUrl(sanitized.link);
    }

    return sanitized;
  });

export const appStateSchema = z
  .object({
    gridSize: z.number().finite().min(0).max(1000).optional().nullable(),
    gridStep: z.number().finite().min(1).max(1000).optional().nullable(),
    viewBackgroundColor: z.string().optional().nullable(),
    currentItemStrokeColor: z.string().optional().nullable(),
    currentItemBackgroundColor: z.string().optional().nullable(),
    currentItemFillStyle: z
      .enum(["solid", "hachure", "cross-hatch", "dots"])
      .optional()
      .nullable(),
    currentItemStrokeWidth: z
      .number()
      .finite()
      .min(0)
      .max(50)
      .optional()
      .nullable(),
    currentItemStrokeStyle: z
      .enum(["solid", "dashed", "dotted"])
      .optional()
      .nullable(),
    currentItemRoundness: z
      .object({
        type: z.enum(["round", "sharp"]),
        value: z.number().finite().min(0).max(1),
      })
      .optional()
      .nullable(),
    currentItemFontSize: z
      .number()
      .finite()
      .min(1)
      .max(500)
      .optional()
      .nullable(),
    currentItemFontFamily: z
      .number()
      .finite()
      .min(1)
      .max(10)
      .optional()
      .nullable(),
    currentItemTextAlign: z
      .enum(["left", "center", "right"])
      .optional()
      .nullable(),
    currentItemVerticalAlign: z
      .enum(["top", "middle", "bottom"])
      .optional()
      .nullable(),
    scrollX: z
      .number()
      .finite()
      .min(-10000000)
      .max(10000000)
      .optional()
      .nullable(),
    scrollY: z
      .number()
      .finite()
      .min(-10000000)
      .max(10000000)
      .optional()
      .nullable(),
    zoom: z
      .object({
        value: z.number().finite().min(0.01).max(100),
      })
      .optional()
      .nullable(),
    selection: z.array(z.string()).optional().nullable(),
    selectedElementIds: z.record(z.string(), z.boolean()).optional().nullable(),
    selectedGroupIds: z.record(z.string(), z.boolean()).optional().nullable(),
    activeEmbeddable: z
      .object({
        elementId: z.string(),
        state: z.string(),
      })
      .optional()
      .nullable(),
    activeTool: z
      .object({
        type: z.string(),
        customType: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
    cursorX: z.number().finite().optional().nullable(),
    cursorY: z.number().finite().optional().nullable(),
    collaborators: z.record(z.string(), z.any()).optional().nullable(),
  })
  .catchall(
    z.any().refine((val) => {
      if (typeof val === "string") {
        return sanitizeText(val, 1000);
      }
      return true;
    })
  );

export const sanitizeDrawingData = (data: {
  elements: any[];
  appState: any;
  files?: any;
  preview?: string | null;
}) => {
  try {
    const sanitizedElements = elementSchema.array().parse(data.elements);
    const sanitizedAppState = appStateSchema.parse(data.appState);

    let sanitizedPreview = data.preview;
    if (typeof sanitizedPreview === "string") {
      sanitizedPreview = sanitizeSvg(sanitizedPreview);
    }

    let sanitizedFiles = data.files;
    if (typeof sanitizedFiles === "object" && sanitizedFiles !== null) {
      sanitizedFiles = JSON.parse(
        JSON.stringify(sanitizedFiles, (key, value) => {
          if (typeof value === "string") {
            return sanitizeText(value, 10000);
          }
          return value;
        })
      );
    }

    return {
      elements: sanitizedElements,
      appState: sanitizedAppState,
      files: sanitizedFiles,
      preview: sanitizedPreview,
    };
  } catch (error) {
    console.error("Data sanitization failed:", error);
    throw new Error("Invalid or malicious drawing data detected");
  }
};

export const validateImportedDrawing = (data: any): boolean => {
  try {
    if (!data || typeof data !== "object") return false;

    if (!Array.isArray(data.elements)) return false;
    if (typeof data.appState !== "object") return false;

    if (data.elements.length > 10000) {
      throw new Error("Drawing contains too many elements (max 10,000)");
    }

    const sanitized = sanitizeDrawingData(data);

    if (sanitized.elements.length !== data.elements.length) {
      throw new Error("Element count mismatch after sanitization");
    }

    return true;
  } catch (error) {
    console.error("Imported drawing validation failed:", error);
    return false;
  }
};
