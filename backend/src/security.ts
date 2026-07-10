/**
 * Security utilities for XSS prevention, data sanitization, and CSRF protection
 */
import { z } from "zod"; import DOMPurify from "dompurify"; import { JSDOM } from "jsdom"; import crypto from "crypto"; import { config } from "./config"; import { MIME_TO_EXT } from "./fileProcessing"; const window = new JSDOM("").window; const purify = DOMPurify(window);
/**
 * Thrown when a drawing's files cannot be sanitized safely (e.g. an image
 * dataURL is malformed/unsupported → 400, or exceeds the size cap → 413).
 * Carries the offending fileId so the client can identify the bad image
 * instead of the sanitizer silently blanking or truncating it.
 */
export class DrawingSanitizationError extends Error { statusCode: number; fileId: string; isOperational = true; constructor(statusCode: number, fileId: string, message: string) { super(message); this.name = "DrawingSanitizationError"; this.statusCode = statusCode; this.fileId = fileId; } }
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Image MIME allowlist derived from the single S3 upload allowlist so the two never drift. */
const SAFE_IMAGE_MIME_TYPES = Object.keys(MIME_TO_EXT);
/** A dataURL is accepted verbatim only if it is `data:image/<allowed>;base64,<base64 body>`. */
const SAFE_IMAGE_DATAURL = new RegExp(`^data:(?:${SAFE_IMAGE_MIME_TYPES.map(escapeRegExp).join("|")});base64,[A-Za-z0-9+/=\\s]+$`, "i");
const API_FILE_REF = /^\/api\/files\/[\w-]{1,200}\/[\w-]{1,200}$/;
/**
 * Configuration for security limits
 */
export interface SecurityConfig {
  /** Maximum size for dataURL in bytes (default: 10MB) */
maxDataUrlSize: number; } const defaultConfig: SecurityConfig = { maxDataUrlSize: 10 * 1024 * 1024, }; let activeConfig: SecurityConfig = { ...defaultConfig };
/**
 * Configure security settings
 * @param config Partial configuration to merge with defaults
 */
export const configureSecuritySettings = ( config: Partial<SecurityConfig> ): void => { activeConfig = { ...activeConfig, ...config }; };
/**
 * Reset security settings to defaults
 */
export const resetSecuritySettings = (): void => { activeConfig = { ...defaultConfig }; };
/**
 * Get current security configuration
 */
export const getSecurityConfig = (): SecurityConfig => { return { ...activeConfig }; };
export const sanitizeSvg = (svgContent: string): string => { if (typeof svgContent !== "string") return ""; const safeImageDataUrlPattern =
/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml);base64,[a-z0-9+/=\s]+$/i; const isSafeImageHref = (href: string): boolean => safeImageDataUrlPattern.test(href) || API_FILE_REF.test(href); const sanitizeSvgImageTags = (content: string): string => content.replace(/<image\b[^>]*>/gi, (imageTag) => { const hrefMatch = imageTag.match(/\shref\s*=\s*"([^"]*)"/i) ?? imageTag.match(/\shref\s*=\s*'([^']*)'/i) ?? imageTag.match(/\sxlink:href\s*=\s*"([^"]*)"/i) ?? imageTag.match(/\sxlink:href\s*=\s*'([^']*)'/i); const hrefValue = hrefMatch?.[1]?.trim(); if (!hrefValue || !isSafeImageHref(hrefValue)) { return ""; } const withoutXlinkHref = imageTag.replace(
/\sxlink:href\s*=\s*(?:"[^"]*"|'[^']*')/gi, "" ); if (/\shref\s*=/i.test(withoutXlinkHref)) { return withoutXlinkHref.replace(
/\shref\s*=\s*(?:"[^"]*"|'[^']*')/i,
          ` href="${hrefValue}"`
); }
      return withoutXlinkHref.replace(/<image\b/i, `<image href="${hrefValue}"`);
}); const sanitized = purify
.sanitize(svgContent, { ALLOWED_TAGS: [ "svg", "defs", "pattern", "g", "image", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan", ], ALLOWED_ATTR: [ "xmlns", "xmlns:xlink", "version", "id", "viewBox", "preserveAspectRatio", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "points", "d", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "transform", "vector-effect", "patternUnits", "patternContentUnits", "font-size", "font-family", "font-weight", "letter-spacing", "text-anchor", "dominant-baseline", "href", "xlink:href", ], FORBID_TAGS: [ "script", "foreignObject", "iframe", "object", "embed", "use", "style", "link", "symbol", "marker", "clipPath", "mask", "filter", ], FORBID_ATTR: [
"onload", "onclick", "onerror", "onmouseover", "onfocus", "onblur", "src", "action", "style", "class", ], KEEP_CONTENT: true, })
.trim(); return sanitizeSvgImageTags(sanitized).trim(); }; export const sanitizeText = ( input: unknown, maxLength: number = 1000 ): string => { if (typeof input !== "string") return ""; const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""); const truncated = cleaned.slice(0, maxLength); return purify
.sanitize(truncated, { ALLOWED_TAGS: ["b", "i", "u", "em", "strong", "br", "span"], ALLOWED_ATTR: [], FORBID_TAGS: [ "script", "iframe", "object", "embed", "link", "style", "form", "input", "button", "select", "textarea", "svg", "foreignObject", ], FORBID_ATTR: [ "onload", "onclick", "onerror", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "onreset", "onkeydown", "onkeyup", "onkeypress", "href", "src", "action", "formaction", "style", ], KEEP_CONTENT: true, })
.trim(); };
/**
 * Sanitize a canvas element's plain-text content. Unlike {@link sanitizeText}
 * (for names/metadata that may land in an HTML context), element text is drawn
 * to the Excalidraw canvas verbatim and is never inserted as HTML, so it must
 * NOT be run through DOMPurify: that strips literal `<value>`-style words as if
 * they were unknown tags and entity-encodes `<`, `&` (turning `3 < 4 & ok` into
 * `3 &lt; 4 &amp; ok`), corrupting imported drawings. We only strip control
 * characters and truncate, preserving angle brackets/ampersands exactly. The
 * SVG preview export path is sanitized separately by {@link sanitizeSvg}.
 */
export const sanitizeElementText = ( input: unknown, maxLength: number = 5000 ): string => { if (typeof input !== "string") return ""; return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").slice(0, maxLength); }; export const sanitizeUrl = (url: unknown): string => { if (typeof url !== "string") return ""; const trimmed = url.trim(); if (/^(javascript|data|vbscript):/i.test(trimmed)) { return ""; } try { if (/^(https?:\/\/|mailto:|\/|\.\/|\.\.\/)/i.test(trimmed)) { return trimmed; } return ""; } catch { return ""; } }; export const elementSchema = z
.object({ id: z.string().min(1).max(200).optional().nullable(), type: z.string().optional().nullable(), x: z.number().optional().nullable(), y: z.number().optional().nullable(), width: z.number().optional().nullable(), height: z.number().optional().nullable(), angle: z.number().optional().nullable(), strokeColor: z.string().optional().nullable(), backgroundColor: z.string().optional().nullable(), fillStyle: z.string().optional().nullable(), strokeWidth: z.number().optional().nullable(), strokeStyle: z.string().optional().nullable(), roundness: z.any().optional().nullable(), boundElements: z.array(z.any()).optional().nullable(), groupIds: z.array(z.string()).optional().nullable(), frameId: z.string().optional().nullable(), seed: z.number().optional().nullable(), version: z.number().optional().nullable(), versionNonce: z.number().optional().nullable(),
isDeleted: z.boolean().optional().nullable(), opacity: z.number().optional().nullable(), link: z.string().optional().nullable(), locked: z.boolean().optional().nullable(), text: z.string().optional().nullable(), fontSize: z.number().optional().nullable(), fontFamily: z.union([z.number(), z.string().max(200)]).optional().nullable(), textAlign: z.string().optional().nullable(), verticalAlign: z.string().optional().nullable(), customData: z.record(z.string(), z.any()).optional().nullable(), })
.passthrough()
.transform((element) => { const sanitized = { ...element }; if (typeof sanitized.text === "string") { sanitized.text = sanitizeElementText(sanitized.text, 5000); } if (typeof sanitized.link === "string") { sanitized.link = sanitizeUrl(sanitized.link); } return sanitized; }); export const appStateSchema = z
.object({ gridSize: z.number().finite().min(0).max(1000).optional().nullable(), gridStep: z.number().finite().min(1).max(1000).optional().nullable(), viewBackgroundColor: z.string().optional().nullable(), currentItemStrokeColor: z.string().optional().nullable(), currentItemBackgroundColor: z.string().optional().nullable(), currentItemFillStyle: z
.enum(["solid", "hachure", "cross-hatch", "dots"])
.optional()
.nullable(), currentItemStrokeWidth: z
.number()
.finite()
.min(0)
.max(50)
.optional()
.nullable(), currentItemStrokeStyle: z
.enum(["solid", "dashed", "dotted"])
.optional()
.nullable(), currentItemRoundness: z
.union([ z.enum(["sharp", "round"]), z.object({ type: z.enum(["round", "sharp"]), value: z.number().finite().min(0).max(1), }), ])
.optional()
.nullable(), currentItemFontSize: z
.number()
.finite()
.min(1)
.max(500)
.optional()
.nullable(), currentItemFontFamily: z
.union([z.number().finite().min(0), z.string().max(200)])
.optional()
.nullable(), currentItemTextAlign: z
.enum(["left", "center", "right"])
.optional()
.nullable(), currentItemVerticalAlign: z
.enum(["top", "middle", "bottom"])
.optional()
.nullable(), scrollX: z
.number()
.finite()
.min(-10000000)
.max(10000000)
.optional()
.nullable(), scrollY: z
.number()
.finite()
.min(-10000000)
.max(10000000)
.optional()
.nullable(), zoom: z
.object({ value: z.number().finite().min(0.01).max(100), })
.optional()
.nullable(), selection: z.array(z.string()).optional().nullable(), selectedElementIds: z.record(z.string(), z.boolean()).optional().nullable(), selectedGroupIds: z.record(z.string(), z.boolean()).optional().nullable(), activeEmbeddable: z
.object({ elementId: z.string(), state: z.string(), })
.optional()
.nullable(), activeTool: z
.object({ type: z.string(), customType: z.string().optional().nullable(), })
.optional()
.nullable(), cursorX: z.number().finite().optional().nullable(), cursorY: z.number().finite().optional().nullable(), collaborators: z.record(z.string(), z.any()).optional().nullable(), })
.catchall( z.any().refine((val) => { if (typeof val === "string") { return sanitizeText(val, 1000); } return true; }) ); export const sanitizeDrawingData = (data: { elements: any[]; appState: any; files?: any; preview?: string | null; }) => { try { const sanitizedElements = elementSchema.array().parse(data.elements); const sanitizedAppState = appStateSchema.parse(data.appState); let sanitizedPreview = data.preview; if (typeof sanitizedPreview === "string") { sanitizedPreview = sanitizeSvg(sanitizedPreview); } let sanitizedFiles = data.files; if (typeof sanitizedFiles === "object" && sanitizedFiles !== null) { sanitizedFiles = structuredClone(sanitizedFiles); const MAX_DATAURL_SIZE = activeConfig.maxDataUrlSize; const VALID_FILE_ID = /^[\w-]{1,200}$/; for (const fileId of Object.keys(sanitizedFiles)) { if (!VALID_FILE_ID.test(fileId)) { delete sanitizedFiles[fileId]; } } for (const fileId in sanitizedFiles) { const file = sanitizedFiles[fileId]; if (typeof file === "object" && file !== null) { for (const key in file) { const value = file[key]; if (typeof value !== "string") { file[key] = sanitizeText(value, 1000); continue; } if (key !== "dataURL") { file[key] = sanitizeText(value, 1000); continue; }
// dataURL is never truncated or HTML-sanitized: a base64 image body is not
// markup, and running injection regexes over it produces false positives that
// corrupt valid images. Accept a valid image dataURL verbatim, keep an already
// uploaded https/S3 reference, otherwise reject the whole save (naming fileId)
// instead of silently blanking it.
if (value === "") { file[key] = ""; continue; } if (value.startsWith("data:")) { if (!SAFE_IMAGE_DATAURL.test(value)) { throw new DrawingSanitizationError(400, fileId, `Image file "${fileId}" has an invalid or unsupported image data URL and was rejected.`); } if (value.length > MAX_DATAURL_SIZE) { throw new DrawingSanitizationError(413, fileId, `Image file "${fileId}" exceeds the maximum allowed size of ${MAX_DATAURL_SIZE} bytes.`); } file[key] = value; } else if (/^https?:\/\//i.test(value)) { if (value.length > 2048) { throw new DrawingSanitizationError(400, fileId, `Image file "${fileId}" has an invalid image URL and was rejected.`); } file[key] = value; } else if (API_FILE_REF.test(value)) { file[key] = value; } else { throw new DrawingSanitizationError(400, fileId, `Image file "${fileId}" has an invalid image reference and was rejected.`); } } } } } return { elements: sanitizedElements, appState: sanitizedAppState, files: sanitizedFiles, preview: sanitizedPreview, }; } catch (error) { if (error instanceof DrawingSanitizationError) throw error; console.error("Data sanitization failed:", error); throw new Error("Invalid or malicious drawing data detected"); } }; export const validateImportedDrawing = (data: any): boolean => { try { if (!data || typeof data !== "object") return false; if (!Array.isArray(data.elements)) return false; if (typeof data.appState !== "object") return false; if (data.elements.length > 10000) {
throw new Error("Drawing contains too many elements (max 10,000)"); } const sanitized = sanitizeDrawingData(data); if (sanitized.elements.length !== data.elements.length) { throw new Error("Element count mismatch after sanitization"); } return true; } catch (error) { console.error("Imported drawing validation failed:", error); return false; } }; const CSRF_TOKEN_HEADER = "x-csrf-token"; const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; const CSRF_TOKEN_FUTURE_SKEW_MS = 5 * 60 * 1000; const CSRF_NONCE_BYTES = 16; const CSRF_TOKEN_MAX_LENGTH = 2048; let cachedCsrfSecret: Buffer | null = null; const getCsrfSecret = (): Buffer => { if (cachedCsrfSecret) return cachedCsrfSecret; const secretFromEnv = config.csrfSecret; if (secretFromEnv && secretFromEnv.trim().length > 0) { cachedCsrfSecret = Buffer.from(secretFromEnv, "utf8"); return cachedCsrfSecret; }
cachedCsrfSecret = crypto.randomBytes(32);
  const envLabel = config.nodeEnv ? ` (${config.nodeEnv})` : "";
console.warn(
    `[SECURITY WARNING] CSRF_SECRET is not set${envLabel}.\n` +
      `Using an ephemeral per-process secret.\n` +
      `  - Tokens will expire on container restart\n` +
      `  - Horizontal scaling (k8s) will NOT work\n` +
      `  - Generate a secret: openssl rand -base64 32\n` +
      `  - Set environment variable: CSRF_SECRET=<generated-secret>`
); return cachedCsrfSecret; }; const base64UrlEncode = (input: Buffer | string): string => { const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input; return buf
.toString("base64")
.replace(/\+/g, "-")
	.replace(/\//g, "_")
.replace(/=+$/g, ""); }; const base64UrlDecode = (input: string): Buffer => { const normalized = input.replace(/-/g, "+").replace(/_/g, "/"); const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4); return Buffer.from(padded, "base64"); }; type CsrfTokenPayload = { ts: number; nonce: string; }; const signCsrfToken = (clientId: string, payload: CsrfTokenPayload): Buffer => { const secret = getCsrfSecret();
  const data = `${clientId}|${payload.ts}|${payload.nonce}`;
return crypto.createHmac("sha256", secret).update(data, "utf8").digest(); }; export const createCsrfToken = (clientId: string): string => { const payload: CsrfTokenPayload = { ts: Date.now(), nonce: base64UrlEncode(crypto.randomBytes(CSRF_NONCE_BYTES)), }; const payloadJson = JSON.stringify(payload); const payloadB64 = base64UrlEncode(payloadJson); const sigB64 = base64UrlEncode(signCsrfToken(clientId, payload));
  return `${payloadB64}.${sigB64}`;
}; export const validateCsrfToken = (clientId: string, token: string): boolean => { if (!token || typeof token !== "string") { return false; } if (token.length > CSRF_TOKEN_MAX_LENGTH) { return false; } try { const parts = token.split("."); if (parts.length !== 2) return false; const [payloadB64, sigB64] = parts; const payloadJson = base64UrlDecode(payloadB64).toString("utf8"); const payload = JSON.parse(payloadJson) as Partial<CsrfTokenPayload>; if ( typeof payload.ts !== "number" || !Number.isFinite(payload.ts) || typeof payload.nonce !== "string" || payload.nonce.length < 8 ) { return false; } const now = Date.now(); if (now - payload.ts > CSRF_TOKEN_EXPIRY_MS) return false; if (payload.ts - now > CSRF_TOKEN_FUTURE_SKEW_MS) return false; const expectedSig = signCsrfToken(clientId, { ts: payload.ts, nonce: payload.nonce, }); const providedSig = base64UrlDecode(sigB64);
if (providedSig.length !== expectedSig.length) return false; return crypto.timingSafeEqual(providedSig, expectedSig); } catch { return false; } }; export const revokeCsrfToken = (clientId: string): void => { void clientId; };
/**
 * Get the CSRF token header name
 */
export const getCsrfTokenHeader = (): string => { return CSRF_TOKEN_HEADER; }; export const getOriginFromReferer = (referer: unknown): string | null => { if (typeof referer !== "string" || referer.trim().length === 0) { return null; } try { const url = new URL(referer); if (url.protocol !== "http:" && url.protocol !== "https:") { return null; }
    return `${url.protocol}//${url.host}`;
} catch { return null; } };
