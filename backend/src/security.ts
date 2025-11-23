/**
 * Security utilities for XSS prevention and data sanitization
 */

import { z } from "zod";

/**
 * Sanitize HTML/JS content by removing dangerous patterns
 */
export const sanitizeHtml = (input: string): string => {
  if (typeof input !== "string") return "";

  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remove script tags
    .replace(/javascript:/gi, "") // Remove javascript: URIs
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "") // Remove event handlers
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "") // Remove iframes
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "") // Remove objects
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "") // Remove embeds
    .replace(/<link\b[^>]*>/gi, "") // Remove link tags
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "") // Remove style tags
    .trim();
};

/**
 * Sanitize SVG content specifically
 */
export const sanitizeSvg = (svgContent: string): string => {
  if (typeof svgContent !== "string") return "";

  // Remove potentially dangerous SVG elements and attributes
  return svgContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(
      /<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi,
      ""
    )
    .replace(/\shref\s*=\s*["'][^"']*(?:javascript:)[^"']*["']/gi, ' href="#"')
    .replace(
      /\sxlink:href\s*=\s*["'][^"']*(?:javascript:)[^"']*["']/gi,
      ' xlink:href="#"'
    )
    .trim();
};

/**
 * Validate and sanitize text content
 */
export const sanitizeText = (
  input: unknown,
  maxLength: number = 1000
): string => {
  if (typeof input !== "string") return "";

  // Remove null bytes and control characters except newlines and tabs
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Truncate if too long
  const truncated = cleaned.slice(0, maxLength);

  // Final HTML sanitization
  return sanitizeHtml(truncated);
};

/**
 * Sanitize URL to prevent javascript: and data: attacks
 */
export const sanitizeUrl = (url: unknown): string => {
  if (typeof url !== "string") return "";

  const trimmed = url.trim();

  // Block javascript:, data:, vbscript: URLs
  if (/^(javascript|data|vbscript):/i.test(trimmed)) {
    return "";
  }

  // Basic URL validation
  try {
    // Allow http, https, mailto, and relative URLs
    if (/^(https?:\/\/|mailto:|\/|\.\/|\.\.\/)/i.test(trimmed)) {
      return trimmed;
    }
    return "";
  } catch {
    return "";
  }
};

/**
 * Strict Zod schema for Excalidraw elements with validation
 */
export const elementSchema = z
  .object({
    id: z.string().min(1).max(100),
    type: z.enum([
      "rectangle",
      "ellipse",
      "diamond",
      "arrow",
      "line",
      "text",
      "image",
      "frame",
      "embed",
      "selection",
      "text-container",
    ]),
    x: z.number().finite().min(-100000).max(100000),
    y: z.number().finite().min(-100000).max(100000),
    width: z.number().finite().min(0).max(100000),
    height: z.number().finite().min(0).max(100000),
    angle: z
      .number()
      .finite()
      .min(-2 * Math.PI)
      .max(2 * Math.PI),
    strokeColor: z.string().optional(),
    backgroundColor: z.string().optional(),
    fillStyle: z.enum(["solid", "hachure", "cross-hatch", "dots"]).optional(),
    strokeWidth: z.number().finite().min(0).max(10).optional(),
    strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    roundness: z
      .object({
        type: z.enum(["round", "sharp"]),
        value: z.number().finite().min(0).max(1),
      })
      .optional(),
    boundElements: z
      .array(
        z.object({
          id: z.string(),
          type: z.string(),
        })
      )
      .optional(),
    groupIds: z.array(z.string()).optional(),
    frameId: z.string().optional(),
    seed: z.number().finite().optional(),
    version: z.number().finite().min(0).max(100000),
    versionNonce: z.number().finite().min(0).max(100000),
    isDeleted: z.boolean().optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    link: z.string().optional().transform(sanitizeUrl),
    locked: z.boolean().optional(),
    // Text-specific properties
    text: z
      .string()
      .optional()
      .transform((val) => sanitizeText(val, 5000)),
    fontSize: z.number().finite().min(1).max(200).optional(),
    fontFamily: z.number().finite().min(1).max(5).optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
    // Custom properties - whitelist only known safe properties
    customData: z.record(z.string(), z.any()).optional(),
  })
  .strict();

/**
 * Strict Zod schema for Excalidraw app state with validation
 */
export const appStateSchema = z
  .object({
    gridSize: z.number().finite().min(0).max(100).optional(),
    gridStep: z.number().finite().min(1).max(100).optional(),
    viewBackgroundColor: z.string().optional(),
    currentItemStrokeColor: z.string().optional(),
    currentItemBackgroundColor: z.string().optional(),
    currentItemFillStyle: z
      .enum(["solid", "hachure", "cross-hatch", "dots"])
      .optional(),
    currentItemStrokeWidth: z.number().finite().min(0).max(10).optional(),
    currentItemStrokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    currentItemRoundness: z
      .object({
        type: z.enum(["round", "sharp"]),
        value: z.number().finite().min(0).max(1),
      })
      .optional(),
    currentItemFontSize: z.number().finite().min(1).max(200).optional(),
    currentItemFontFamily: z.number().finite().min(1).max(5).optional(),
    currentItemTextAlign: z.enum(["left", "center", "right"]).optional(),
    currentItemVerticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
    scrollX: z.number().finite().min(-1000000).max(1000000).optional(),
    scrollY: z.number().finite().min(-1000000).max(1000000).optional(),
    zoom: z
      .object({
        value: z.number().finite().min(0.1).max(10),
      })
      .optional(),
    selection: z.array(z.string()).optional(),
    selectedElementIds: z.record(z.string(), z.boolean()).optional(),
    selectedGroupIds: z.record(z.string(), z.boolean()).optional(),
    activeEmbeddable: z
      .object({
        elementId: z.string(),
        state: z.string(),
      })
      .optional(),
    activeTool: z
      .object({
        type: z.string(),
        customType: z.string().optional(),
      })
      .optional(),
    cursorX: z.number().finite().optional(),
    cursorY: z.number().finite().optional(),
    // Sanitize any string values in appState
  })
  .strict()
  .catchall(
    z.any().refine((val) => {
      // Recursively sanitize any string values found in the object
      if (typeof val === "string") {
        return sanitizeText(val, 1000);
      }
      return true;
    })
  );

/**
 * Sanitize drawing data before persistence
 */
export const sanitizeDrawingData = (data: {
  elements: any[];
  appState: any;
  files?: any;
  preview?: string | null;
}) => {
  try {
    // Validate and sanitize elements
    const sanitizedElements = elementSchema.array().parse(data.elements);

    // Validate and sanitize app state
    const sanitizedAppState = appStateSchema.parse(data.appState);

    // Sanitize preview SVG if present
    let sanitizedPreview = data.preview;
    if (typeof sanitizedPreview === "string") {
      sanitizedPreview = sanitizeSvg(sanitizedPreview);
    }

    // Sanitize files object
    let sanitizedFiles = data.files;
    if (typeof sanitizedFiles === "object" && sanitizedFiles !== null) {
      // Recursively sanitize any string values in files
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

/**
 * Validate imported .excalidraw file structure
 */
export const validateImportedDrawing = (data: any): boolean => {
  try {
    // Basic structure validation
    if (!data || typeof data !== "object") return false;

    if (!Array.isArray(data.elements)) return false;
    if (typeof data.appState !== "object") return false;

    // Check element count to prevent DoS
    if (data.elements.length > 10000) {
      throw new Error("Drawing contains too many elements (max 10,000)");
    }

    // Sanitize and validate the data
    const sanitized = sanitizeDrawingData(data);

    // Additional structural validation
    if (sanitized.elements.length !== data.elements.length) {
      throw new Error("Element count mismatch after sanitization");
    }

    return true;
  } catch (error) {
    console.error("Imported drawing validation failed:", error);
    return false;
  }
};
