/**
 * Security utilities for XSS prevention, data sanitization, and CSRF protection
 */

import { z } from "zod";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import crypto from "crypto";

// Create a DOM environment for DOMPurify (Node.js compatibility)
const window = new JSDOM("").window;
const purify = DOMPurify(window);

/**
 * Sanitize HTML/JS content using DOMPurify (battle-tested library)
 */
export const sanitizeHtml = (input: string): string => {
  if (typeof input !== "string") return "";

  return purify
    .sanitize(input, {
      ALLOWED_TAGS: [
        // Allow basic text formatting that might be in drawings
        "b",
        "i",
        "u",
        "em",
        "strong",
        "p",
        "br",
        "span",
        "div",
      ],
      ALLOWED_ATTR: [], // No attributes allowed by default for security
      FORBID_TAGS: [
        // Explicitly forbid dangerous tags
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
        // Explicitly forbid dangerous attributes
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
      KEEP_CONTENT: true, // Keep content even if tags are removed
    })
    .trim();
};

/**
 * Sanitize SVG content using DOMPurify with strict SVG restrictions
 */
export const sanitizeSvg = (svgContent: string): string => {
  if (typeof svgContent !== "string") return "";

  // For SVG content, we'll be very restrictive since SVG can execute JavaScript
  // We only allow basic geometric shapes without any scripts or external references
  return purify
    .sanitize(svgContent, {
      ALLOWED_TAGS: [
        // Allow only safe SVG geometric elements
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
        // Allow only safe geometric attributes
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
        // Completely forbid any script-related or external content
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
        // Forbid any attributes that could execute code or load external content
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

/**
 * Validate and sanitize text content using DOMPurify
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

  // Use DOMPurify for text content - more permissive than HTML but still safe
  return purify
    .sanitize(truncated, {
      ALLOWED_TAGS: [
        // Allow basic text formatting that might be in drawing text
        "b",
        "i",
        "u",
        "em",
        "strong",
        "br",
        "span",
      ],
      ALLOWED_ATTR: [], // No attributes allowed for text content
      FORBID_TAGS: [
        // Block potentially dangerous tags
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
        // Block all event handlers and dangerous attributes
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
 * Very flexible Zod schema for Excalidraw elements
 */
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
    // Apply basic sanitization to string values only
    const sanitized = { ...element };

    if (typeof sanitized.text === "string") {
      sanitized.text = sanitizeText(sanitized.text, 5000);
    }

    if (typeof sanitized.link === "string") {
      sanitized.link = sanitizeUrl(sanitized.link);
    }

    return sanitized;
  });

/**
 * Flexible Zod schema for Excalidraw app state with validation
 */
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
    // Add common Excalidraw app state properties
    collaborators: z.record(z.string(), z.any()).optional().nullable(),
  })
  // Allow any additional properties
  .catchall(
    z.any().refine((val) => {
      // Sanitize string values, but be more permissive for other types
      if (typeof val === "string") {
        return sanitizeText(val, 1000);
      }
      // Allow numbers, booleans, objects, arrays, null, undefined
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

// ============================================================================
// CSRF Protection
// ============================================================================

const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_HEADER = "x-csrf-token";
const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_STORE_SIZE = 10000; // Prevent memory exhaustion

// In-memory token store with expiration
// In production with multiple instances, use Redis or similar
const csrfTokenStore = new Map<string, { token: string; expiresAt: number }>();

// Cleanup expired tokens every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of csrfTokenStore.entries()) {
    if (now > data.expiresAt) {
      csrfTokenStore.delete(key);
    }
  }
}, 15 * 60 * 1000).unref();

/**
 * Generate a cryptographically secure CSRF token
 */
export const generateCsrfToken = (): string => {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
};

/**
 * Create and store a new CSRF token for a client
 * Returns the token to be sent to the client
 */
export const createCsrfToken = (clientId: string): string => {
  // Prevent DoS by limiting store size
  if (csrfTokenStore.size >= MAX_STORE_SIZE) {
    // Remove oldest entry if full (simple LRU approximation)
    const firstKey = csrfTokenStore.keys().next().value;
    if (firstKey) csrfTokenStore.delete(firstKey);
  }

  const token = generateCsrfToken();
  csrfTokenStore.set(clientId, {
    token,
    expiresAt: Date.now() + CSRF_TOKEN_EXPIRY_MS,
  });
  return token;
};

/**
 * Validate a CSRF token for a client
 * Uses timing-safe comparison to prevent timing attacks
 */
export const validateCsrfToken = (clientId: string, token: string): boolean => {
  if (!token || typeof token !== "string") {
    return false;
  }

  const stored = csrfTokenStore.get(clientId);
  if (!stored) {
    return false;
  }

  // Check if token has expired
  if (Date.now() > stored.expiresAt) {
    csrfTokenStore.delete(clientId);
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    const storedBuffer = Buffer.from(stored.token, "utf8");
    const providedBuffer = Buffer.from(token, "utf8");

    if (storedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(storedBuffer, providedBuffer);
  } catch {
    return false;
  }
};

/**
 * Revoke a CSRF token (e.g., on logout or token refresh)
 */
export const revokeCsrfToken = (clientId: string): void => {
  csrfTokenStore.delete(clientId);
};

/**
 * Get the CSRF token header name
 */
export const getCsrfTokenHeader = (): string => {
  return CSRF_TOKEN_HEADER;
};
