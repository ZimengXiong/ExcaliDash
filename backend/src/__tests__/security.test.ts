/**
 * Additional tests for security.ts to improve coverage
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sanitizeHtml,
  sanitizeSvg,
  sanitizeText,
  sanitizeUrl,
  sanitizeDrawingData,
  validateImportedDrawing,
  createCsrfToken,
  validateCsrfToken,
  revokeCsrfToken,
  getCsrfTokenHeader,
  getOriginFromReferer,
  configureSecuritySettings,
  resetSecuritySettings,
  getSecurityConfig,
} from "../security";

describe("sanitizeHtml", () => {
  it("should allow safe HTML tags", () => {
    const input = "<b>bold</b> <i>italic</i> <u>underline</u>";
    const result = sanitizeHtml(input);
    expect(result).toContain("bold");
    expect(result).toContain("italic");
  });

  it("should remove script tags", () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("script");
    expect(result).not.toContain("alert");
    expect(result).toContain("Hello");
  });

  it("should remove event handlers", () => {
    const input = '<div onclick="alert(1)">Click me</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("onclick");
    expect(result).toContain("Click me");
  });

  it("should remove iframe tags", () => {
    const input = '<iframe src="https://evil.com"></iframe>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("iframe");
  });

  it("should handle non-string input", () => {
    expect(sanitizeHtml(null as any)).toBe("");
    expect(sanitizeHtml(undefined as any)).toBe("");
    expect(sanitizeHtml(123 as any)).toBe("");
  });

  it("should trim whitespace", () => {
    const result = sanitizeHtml("  <p>text</p>  ");
    expect(result).not.toMatch(/^\s/);
    expect(result).not.toMatch(/\s$/);
  });
});

describe("sanitizeSvg", () => {
  it("should allow basic SVG elements", () => {
    const input = '<svg><rect x="0" y="0" width="100" height="100"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain("svg");
    expect(result).toContain("rect");
  });

  it("should remove script from SVG", () => {
    const input = '<svg><script>alert(1)</script><rect/></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain("script");
  });

  it("should remove foreignObject", () => {
    const input = '<svg><foreignObject><body>html</body></foreignObject></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain("foreignObject");
  });

  it("should allow safe attributes", () => {
    const input = '<svg><circle cx="50" cy="50" r="40" fill="red" stroke="black"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain('fill');
    expect(result).toContain('stroke');
  });

  it("should remove dangerous attributes", () => {
    const input = '<svg onload="alert(1)"><rect onclick="alert(2)"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain("onload");
    expect(result).not.toContain("onclick");
  });

  it("should handle non-string input", () => {
    expect(sanitizeSvg(null as any)).toBe("");
    expect(sanitizeSvg(123 as any)).toBe("");
  });
});

describe("sanitizeText", () => {
  it("should clean basic text", () => {
    const result = sanitizeText("Hello World");
    expect(result).toBe("Hello World");
  });

  it("should remove control characters", () => {
    const input = "Hello\x00\x01\x02World";
    const result = sanitizeText(input);
    expect(result).toBe("HelloWorld");
  });

  it("should truncate long text", () => {
    const input = "a".repeat(2000);
    const result = sanitizeText(input, 100);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("should handle non-string input", () => {
    expect(sanitizeText(null)).toBe("");
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText(123)).toBe("");
  });

  it("should use default max length", () => {
    const input = "a".repeat(2000);
    const result = sanitizeText(input);
    expect(result.length).toBeLessThanOrEqual(1000);
  });
});

describe("sanitizeUrl", () => {
  it("should allow http URLs", () => {
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("should allow https URLs", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("should allow relative URLs", () => {
    expect(sanitizeUrl("/path/to/page")).toBe("/path/to/page");
    expect(sanitizeUrl("./relative")).toBe("./relative");
    expect(sanitizeUrl("../parent")).toBe("../parent");
  });

  it("should allow mailto links", () => {
    expect(sanitizeUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
  });

  it("should block javascript: URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeUrl("JAVASCRIPT:alert(1)")).toBe("");
  });

  it("should block data: URLs", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
  });

  it("should block vbscript: URLs", () => {
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("");
  });

  it("should handle non-string input", () => {
    expect(sanitizeUrl(null)).toBe("");
    expect(sanitizeUrl(undefined)).toBe("");
    expect(sanitizeUrl(123)).toBe("");
  });

  it("should trim whitespace", () => {
    expect(sanitizeUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("should reject unknown protocols", () => {
    expect(sanitizeUrl("ftp://server.com")).toBe("");
    expect(sanitizeUrl("file:///etc/passwd")).toBe("");
  });
});

describe("sanitizeDrawingData", () => {
  it("should sanitize valid drawing data", () => {
    const data = {
      elements: [{ id: "1", type: "rectangle" }],
      appState: { viewBackgroundColor: "#ffffff" },
    };

    const result = sanitizeDrawingData(data);
    expect(result.elements).toHaveLength(1);
    expect(result.appState).toBeDefined();
  });

  it("should sanitize text in elements", () => {
    const data = {
      elements: [{ id: "1", type: "text", text: '<script>alert(1)</script>Hello' }],
      appState: {},
    };

    const result = sanitizeDrawingData(data);
    expect(result.elements[0].text).not.toContain("script");
    expect(result.elements[0].text).toContain("Hello");
  });

  it("should sanitize links in elements", () => {
    const data = {
      elements: [{ id: "1", link: "javascript:alert(1)" }],
      appState: {},
    };

    const result = sanitizeDrawingData(data);
    expect(result.elements[0].link).toBe("");
  });

  it("should sanitize SVG preview", () => {
    const data = {
      elements: [],
      appState: {},
      preview: '<svg onload="alert(1)"><rect/></svg>',
    };

    const result = sanitizeDrawingData(data);
    expect(result.preview).not.toContain("onload");
  });

  it("should handle files with safe image data URLs", () => {
    const data = {
      elements: [],
      appState: {},
      files: {
        "file1": {
          dataURL: "data:image/png;base64,iVBORw0KGgo=",
          mimeType: "image/png",
        },
      },
    };

    const result = sanitizeDrawingData(data);
    expect(result.files["file1"].dataURL).toContain("data:image/png");
  });

  it("should block dangerous data URLs in files", () => {
    const data = {
      elements: [],
      appState: {},
      files: {
        "file1": {
          dataURL: "javascript:alert(1)",
          mimeType: "text/html",
        },
      },
    };

    const result = sanitizeDrawingData(data);
    expect(result.files["file1"].dataURL).toBe("");
  });

  it("should block data:text/html URLs", () => {
    const data = {
      elements: [],
      appState: {},
      files: {
        "file1": {
          dataURL: "data:text/html,<script>alert(1)</script>",
        },
      },
    };

    const result = sanitizeDrawingData(data);
    expect(result.files["file1"].dataURL).toBe("");
  });

  it("should throw on invalid data", () => {
    expect(() => sanitizeDrawingData({ elements: "invalid" } as any)).toThrow();
  });

  it("should sanitize non-image data URLs in files", () => {
    const data = {
      elements: [],
      appState: {},
      files: {
        "file1": {
          dataURL: "data:application/pdf;base64,SGVsbG8=",
          mimeType: "application/pdf",
        },
      },
    };

    const result = sanitizeDrawingData(data);
    // Non-image data URLs should be sanitized as text
    expect(result.files["file1"].dataURL).toBeDefined();
  });

  it("should handle files with unknown protocol URLs", () => {
    const data = {
      elements: [],
      appState: {},
      files: {
        "file1": {
          dataURL: "ftp://example.com/file.png",
          mimeType: "image/png",
        },
      },
    };

    const result = sanitizeDrawingData(data);
    // Unknown protocol URLs are sanitized as text (not blocked entirely)
    expect(result.files["file1"].dataURL).toBeDefined();
  });
});

describe("validateImportedDrawing", () => {
  it("should validate correct drawing", () => {
    const data = {
      elements: [{ id: "1" }],
      appState: { viewBackgroundColor: "#ffffff" },
    };
    expect(validateImportedDrawing(data)).toBe(true);
  });

  it("should reject null data", () => {
    expect(validateImportedDrawing(null)).toBe(false);
  });

  it("should reject non-object data", () => {
    expect(validateImportedDrawing("string")).toBe(false);
    expect(validateImportedDrawing(123)).toBe(false);
  });

  it("should reject missing elements", () => {
    expect(validateImportedDrawing({ appState: {} })).toBe(false);
  });

  it("should reject non-array elements", () => {
    expect(validateImportedDrawing({ elements: "not array", appState: {} })).toBe(false);
  });

  it("should reject missing appState", () => {
    expect(validateImportedDrawing({ elements: [] })).toBe(false);
  });

  it("should reject too many elements", () => {
    const tooManyElements = Array(10001).fill({ id: "elem" });
    expect(validateImportedDrawing({ elements: tooManyElements, appState: {} })).toBe(false);
  });
});

describe("CSRF Token Functions", () => {
  const testClientId = "test-client-127.0.0.1";

  describe("createCsrfToken", () => {
    it("should create a token string", () => {
      const token = createCsrfToken(testClientId);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should create tokens with two parts", () => {
      const token = createCsrfToken(testClientId);
      const parts = token.split(".");
      expect(parts).toHaveLength(2);
    });

    it("should create unique tokens each time", () => {
      const token1 = createCsrfToken(testClientId);
      const token2 = createCsrfToken(testClientId);
      expect(token1).not.toBe(token2);
    });
  });

  describe("validateCsrfToken", () => {
    it("should validate a freshly created token", () => {
      const token = createCsrfToken(testClientId);
      expect(validateCsrfToken(testClientId, token)).toBe(true);
    });

    it("should reject token for different client", () => {
      const token = createCsrfToken(testClientId);
      expect(validateCsrfToken("different-client", token)).toBe(false);
    });

    it("should reject empty token", () => {
      expect(validateCsrfToken(testClientId, "")).toBe(false);
    });

    it("should reject null token", () => {
      expect(validateCsrfToken(testClientId, null as any)).toBe(false);
    });

    it("should reject malformed token", () => {
      expect(validateCsrfToken(testClientId, "not.valid.token")).toBe(false);
      expect(validateCsrfToken(testClientId, "noperiod")).toBe(false);
    });

    it("should reject tampered token", () => {
      const token = createCsrfToken(testClientId);
      const tampered = token.replace(/.$/, "X");
      expect(validateCsrfToken(testClientId, tampered)).toBe(false);
    });

    it("should reject very long tokens", () => {
      const longToken = "a".repeat(3000);
      expect(validateCsrfToken(testClientId, longToken)).toBe(false);
    });

    it("should reject token with invalid base64 in payload", () => {
      // Create token with invalid base64 that will cause parse error
      const invalidToken = "!!!invalid-base64!!!.signature";
      expect(validateCsrfToken(testClientId, invalidToken)).toBe(false);
    });

    it("should reject token with invalid JSON payload", () => {
      // Create a base64-encoded invalid JSON
      const invalidJson = Buffer.from("not-json").toString("base64url");
      const token = `${invalidJson}.signature`;
      expect(validateCsrfToken(testClientId, token)).toBe(false);
    });

    it("should reject token with missing timestamp", () => {
      // Create a token with payload missing timestamp
      const payload = { nonce: "validnonce123" };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const token = `${payloadB64}.fakesignature`;
      expect(validateCsrfToken(testClientId, token)).toBe(false);
    });

    it("should reject token with invalid nonce", () => {
      // Create a token with short nonce
      const payload = { ts: Date.now(), nonce: "short" };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const token = `${payloadB64}.fakesignature`;
      expect(validateCsrfToken(testClientId, token)).toBe(false);
    });

    it("should reject token with non-finite timestamp", () => {
      const payload = { ts: Infinity, nonce: "validnonce123" };
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const token = `${payloadB64}.fakesignature`;
      expect(validateCsrfToken(testClientId, token)).toBe(false);
    });
  });

  describe("revokeCsrfToken", () => {
    it("should not throw when called", () => {
      expect(() => revokeCsrfToken(testClientId)).not.toThrow();
    });
  });

  describe("getCsrfTokenHeader", () => {
    it("should return header name", () => {
      const header = getCsrfTokenHeader();
      expect(header).toBe("x-csrf-token");
    });
  });
});

describe("getOriginFromReferer", () => {
  it("should extract origin from valid referer", () => {
    expect(getOriginFromReferer("https://example.com/path/page")).toBe("https://example.com");
    expect(getOriginFromReferer("http://localhost:3000/")).toBe("http://localhost:3000");
  });

  it("should handle referer with port", () => {
    expect(getOriginFromReferer("https://example.com:8080/page")).toBe("https://example.com:8080");
  });

  it("should return null for invalid referer", () => {
    expect(getOriginFromReferer("")).toBeNull();
    expect(getOriginFromReferer(null)).toBeNull();
    expect(getOriginFromReferer(undefined)).toBeNull();
  });

  it("should return null for non-http protocols", () => {
    expect(getOriginFromReferer("ftp://example.com")).toBeNull();
    expect(getOriginFromReferer("file:///etc/passwd")).toBeNull();
  });

  it("should handle malformed URLs", () => {
    expect(getOriginFromReferer("not a url")).toBeNull();
  });
});

describe("Security Configuration", () => {
  afterEach(() => {
    resetSecuritySettings();
  });

  it("should get default config", () => {
    const config = getSecurityConfig();
    expect(config.maxDataUrlSize).toBe(10 * 1024 * 1024);
  });

  it("should configure settings", () => {
    configureSecuritySettings({ maxDataUrlSize: 5 * 1024 * 1024 });
    const config = getSecurityConfig();
    expect(config.maxDataUrlSize).toBe(5 * 1024 * 1024);
  });

  it("should reset settings", () => {
    configureSecuritySettings({ maxDataUrlSize: 1000 });
    resetSecuritySettings();
    const config = getSecurityConfig();
    expect(config.maxDataUrlSize).toBe(10 * 1024 * 1024);
  });

  it("should return copy of config", () => {
    const config1 = getSecurityConfig();
    const config2 = getSecurityConfig();
    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });
});
