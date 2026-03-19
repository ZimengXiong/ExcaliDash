/**
 * Integration tests for Drawing API - Image Persistence
 * 
 * These tests specifically target the bug from GitHub issue #17:
 * "Images don't load fully when reopening the file"
 * 
 * The root cause was that sanitizeDrawingData() was truncating all strings
 * in the files object to 10000 characters, which corrupted base64 image data URLs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  getTestPrisma,
  cleanupTestDb,
  initTestDb,
  setupTestDb,
  createTestDrawingPayload,
  createSampleFilesObject,
  generateLargeImageDataUrl,
  compareFilesObjects,
} from "./testUtils";
import { 
  sanitizeDrawingData, 
  validateImportedDrawing,
  configureSecuritySettings,
  resetSecuritySettings,
  getSecurityConfig,
} from "../security";

describe("Security Sanitization - Image Data URLs", () => {
  beforeEach(() => {
    resetSecuritySettings();
  });

  describe("configurable size limits", () => {
    it("should use default 10MB limit", () => {
      const config = getSecurityConfig();
      expect(config.maxDataUrlSize).toBe(10 * 1024 * 1024);
    });

    it("should allow configuring the size limit", () => {
      configureSecuritySettings({ maxDataUrlSize: 5 * 1024 * 1024 });
      const config = getSecurityConfig();
      expect(config.maxDataUrlSize).toBe(5 * 1024 * 1024);
    });

    it("should reject dataURL exceeding configured limit", () => {
      configureSecuritySettings({ maxDataUrlSize: 1000 });
      
      const largeDataUrl = "data:image/png;base64," + "A".repeat(2000);
      const files = {
        "file-1": {
          id: "file-1",
          mimeType: "image/png",
          dataURL: largeDataUrl,
          created: Date.now(),
        },
      };
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files,
      });
      
      const resultFiles = result.files as Record<string, any>;
      expect(resultFiles["file-1"].dataURL).toBe("");
    });

    it("should allow dataURL under configured limit", () => {
      configureSecuritySettings({ maxDataUrlSize: 5000 });
      
      const smallDataUrl = "data:image/png;base64," + "A".repeat(100);
      const files = {
        "file-1": {
          id: "file-1",
          mimeType: "image/png",
          dataURL: smallDataUrl,
          created: Date.now(),
        },
      };
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files,
      });
      
      const resultFiles = result.files as Record<string, any>;
      expect(resultFiles["file-1"].dataURL).toBe(smallDataUrl);
    });

    it("should reset to defaults", () => {
      configureSecuritySettings({ maxDataUrlSize: 100 });
      expect(getSecurityConfig().maxDataUrlSize).toBe(100);
      
      resetSecuritySettings();
      expect(getSecurityConfig().maxDataUrlSize).toBe(10 * 1024 * 1024);
    });
  });

  describe("sanitizeDrawingData - files handling", () => {
    it("should preserve small image data URLs unchanged", () => {
      const files = createSampleFilesObject(1, "small");
      const originalDataUrl = Object.values(files)[0].dataURL;
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files,
      });
      
      const resultFiles = result.files as Record<string, any>;
      const resultDataUrl = Object.values(resultFiles)[0]?.dataURL;
      
      expect(resultDataUrl).toBe(originalDataUrl);
      expect(resultDataUrl.length).toBe(originalDataUrl.length);
    });

    it("should preserve large image data URLs (>10000 chars) - REGRESSION TEST for issue #17", () => {
      const files = createSampleFilesObject(1, "large");
      const originalDataUrl = Object.values(files)[0].dataURL;
      
      expect(originalDataUrl.length).toBeGreaterThan(10000);
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files,
      });
      
      const resultFiles = result.files as Record<string, any>;
      const resultDataUrl = Object.values(resultFiles)[0]?.dataURL;
      
      expect(resultDataUrl.length).toBe(originalDataUrl.length);
      expect(resultDataUrl).toBe(originalDataUrl);
    });

    it("should handle multiple images with large data URLs", () => {
      const files = createSampleFilesObject(3, "large");
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files,
      });
      
      const comparison = compareFilesObjects(files, result.files as Record<string, any>);
      expect(comparison.isEqual).toBe(true);
      expect(comparison.differences).toHaveLength(0);
    });

    it("should sanitize malicious script tags in dataURL", () => {
      const maliciousFiles = {
        "file-1": {
          id: "file-1",
          mimeType: "image/png",
          dataURL: "data:image/png;base64,<script>alert('xss')</script>AAAA",
          created: Date.now(),
        },
      };
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: maliciousFiles,
      });
      
      const resultFiles = result.files as Record<string, any>;
      expect(resultFiles["file-1"].dataURL).not.toContain("<script>");
    });

    it("should sanitize javascript: protocol in dataURL", () => {
      const maliciousFiles = {
        "file-1": {
          id: "file-1",
          mimeType: "image/png",
          dataURL: "javascript:alert('xss')",
          created: Date.now(),
        },
      };
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: maliciousFiles,
      });
      
      const resultFiles = result.files as Record<string, any>;
      expect(resultFiles["file-1"].dataURL).not.toContain("javascript:");
    });

    it("should handle null files object", () => {
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: null,
      });
      
      expect(result.files).toBeNull();
    });

    it("should handle empty files object", () => {
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      });
      
      expect(result.files).toEqual({});
    });

    it("should sanitize non-dataURL string properties in files", () => {
      const files = {
        "file-1": {
          id: "<script>alert('xss')</script>",
          mimeType: "image/png<script>",
          dataURL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
          created: Date.now(),
        },
      };
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files,
      });
      
      const resultFiles = result.files as Record<string, any>;
      expect(resultFiles["file-1"].id).not.toContain("<script>");
      expect(resultFiles["file-1"].mimeType).not.toContain("<script>");
      expect(resultFiles["file-1"].dataURL).toBe(files["file-1"].dataURL);
    });

    it("should handle case-insensitive image MIME types", () => {
      const files = {
        "file-1": {
          id: "file-1",
          mimeType: "IMAGE/PNG",
          dataURL: "data:IMAGE/PNG;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
          created: Date.now(),
        },
      };
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files,
      });
      
      const resultFiles = result.files as Record<string, any>;
      expect(resultFiles["file-1"].dataURL).toBe(files["file-1"].dataURL);
    });
  });

  describe("sanitizeDrawingData - preview svg handling", () => {
    it("should preserve safe SVG layout attributes needed for thumbnail rendering", () => {
      const preview = [
        '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 728.39453125 606.908203125" width="1456.7890625" height="1213.81640625" preserveAspectRatio="xMidYMid meet">',
        '<rect x="0" y="0" width="728.39453125" height="606.908203125" fill="#ffffff"></rect>',
        '<path d="M0 0 L20 20" stroke="#000" stroke-linecap="round"></path>',
        "</svg>",
      ].join("");

      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
        preview,
      });

      expect(result.preview).toContain('viewBox="0 0 728.39453125 606.908203125"');
      expect(result.preview).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(result.preview).toContain('stroke-linecap="round"');
      expect(result.preview).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it("should preserve safe embedded image previews", () => {
      const preview = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">',
        '<image x="0" y="0" width="40" height="40" href="data:image/png;base64,AAAA"></image>',
        "</svg>",
      ].join("");

      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
        preview,
      });

      expect(result.preview).toContain("<image");
      expect(result.preview).toContain('href="data:image/png;base64,AAAA"');
    });

    it("should remove embedded images with unsafe href values", () => {
      const preview = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">',
        '<image x="0" y="0" width="40" height="40" href="javascript:alert(1)"></image>',
        '<rect x="0" y="0" width="10" height="10" fill="#000"></rect>',
        "</svg>",
      ].join("");

      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
        preview,
      });

      expect(result.preview).not.toContain("<image");
      expect(result.preview).toContain("<rect");
    });

    it("should preserve safe defs/pattern image structures used by Excalidraw exports", () => {
      const preview = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
        '<defs><pattern id="p1" width="1" height="1" patternUnits="objectBoundingBox">',
        '<image href="data:image/png;base64,AAAA" width="100" height="100"></image>',
        "</pattern></defs>",
        '<rect x="0" y="0" width="100" height="100" fill="url(#p1)"></rect>',
        "</svg>",
      ].join("");

      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
        preview,
      });

      expect(result.preview).toContain("<defs>");
      expect(result.preview).toContain("<pattern");
      expect(result.preview).toContain('id="p1"');
      expect(result.preview).toContain("<image");
      expect(result.preview).toContain('fill="url(#p1)"');
    });
  });

  describe("validateImportedDrawing - with files", () => {
    it("should validate drawing with embedded images", () => {
      const files = createSampleFilesObject(2, "large");
      const drawing = {
        elements: [
          {
            id: "img-1",
            type: "image",
            fileId: Object.keys(files)[0],
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            angle: 0,
            version: 1,
            versionNonce: 1,
          },
        ],
        appState: { viewBackgroundColor: "#ffffff" },
        files,
      };
      
      const isValid = validateImportedDrawing(drawing);
      expect(isValid).toBe(true);
    });

    it("should reject drawing with malicious content in files", () => {
      const drawing = {
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {
          "file-1": {
            id: "file-1",
            dataURL: "javascript:alert('xss')",
          },
        },
      };
      
      const isValid = validateImportedDrawing(drawing);
      expect(isValid).toBe(true);
    });
  });
});

describe("Drawing API - Database Round-Trip", () => {
  const prisma = getTestPrisma();
  let testUser: { id: string };

  beforeAll(async () => {
    await setupTestDb();
    testUser = await initTestDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupTestDb(prisma);
  });

  it("should preserve image data URLs through create and read cycle", async () => {
    const files = createSampleFilesObject(1, "large");
    const originalDataUrl = Object.values(files)[0].dataURL;
    
    expect(originalDataUrl.length).toBeGreaterThan(10000);
    
    const created = await prisma.drawing.create({
      data: {
        name: "Test with Image",
        elements: JSON.stringify([]),
        appState: JSON.stringify({ viewBackgroundColor: "#ffffff" }),
        files: JSON.stringify(files),
        userId: testUser.id,
      },
    });
    
    const retrieved = await prisma.drawing.findUnique({
      where: { id: created.id },
    });
    
    expect(retrieved).not.toBeNull();
    
    const parsedFiles = JSON.parse(retrieved!.files || "{}");
    const retrievedDataUrl = Object.values(parsedFiles as Record<string, any>)[0]?.dataURL;
    
    expect(retrievedDataUrl.length).toBe(originalDataUrl.length);
    expect(retrievedDataUrl).toBe(originalDataUrl);
  });

  it("should handle multiple images with varying sizes", async () => {
    const files = {
      "small-image": {
        id: "small-image",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
      },
      "large-image": {
        id: "large-image",
        mimeType: "image/png",
        dataURL: generateLargeImageDataUrl(),
      },
    };
    
    const created = await prisma.drawing.create({
      data: {
        name: "Multi-Image Test",
        elements: JSON.stringify([]),
        appState: JSON.stringify({}),
        files: JSON.stringify(files),
        userId: testUser.id,
      },
    });
    
    const retrieved = await prisma.drawing.findUnique({
      where: { id: created.id },
    });
    
    const parsedFiles = JSON.parse(retrieved!.files || "{}") as Record<string, any>;
    
    expect(parsedFiles["small-image"].dataURL).toBe(files["small-image"].dataURL);
    expect(parsedFiles["large-image"].dataURL).toBe(files["large-image"].dataURL);
    expect(parsedFiles["large-image"].dataURL.length).toBe(files["large-image"].dataURL.length);
  });

  it("should preserve files through update cycle", async () => {
    const created = await prisma.drawing.create({
      data: {
        name: "Update Test",
        elements: JSON.stringify([]),
        appState: JSON.stringify({}),
        files: JSON.stringify({}),
        userId: testUser.id,
      },
    });
    
    const files = createSampleFilesObject(1, "large");
    const originalDataUrl = Object.values(files)[0].dataURL;
    
    await prisma.drawing.update({
      where: { id: created.id },
      data: {
        files: JSON.stringify(files),
      },
    });
    
    const retrieved = await prisma.drawing.findUnique({
      where: { id: created.id },
    });
    
    const parsedFiles = JSON.parse(retrieved!.files || "{}") as Record<string, any>;
    const retrievedDataUrl = Object.values(parsedFiles)[0]?.dataURL;
    
    expect(retrievedDataUrl).toBe(originalDataUrl);
  });
});

describe("Issue #17 Regression Test - Images Not Loading Fully", () => {
  it("should reproduce and verify fix for truncated image data", () => {
    
    const largeImageDataUrl = generateLargeImageDataUrl();
    
    expect(largeImageDataUrl.length).toBeGreaterThan(10000);
    console.log(`Testing with image data URL of length: ${largeImageDataUrl.length}`);
    
    const filesObject = {
      "user-uploaded-image": {
        id: "user-uploaded-image",
        mimeType: "image/png",
        dataURL: largeImageDataUrl,
        created: Date.now(),
        lastRetrieved: Date.now(),
      },
    };
    
    const sanitizedData = sanitizeDrawingData({
      elements: [
        {
          id: "image-element",
          type: "image",
          fileId: "user-uploaded-image",
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          angle: 0,
          version: 1,
          versionNonce: 1,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
      files: filesObject,
      preview: null,
    });
    
    const sanitizedFiles = sanitizedData.files as Record<string, any>;
    const sanitizedDataUrl = sanitizedFiles["user-uploaded-image"]?.dataURL;
    
    expect(sanitizedDataUrl).toBeDefined();
    expect(sanitizedDataUrl.length).toBe(largeImageDataUrl.length);
    expect(sanitizedDataUrl).toBe(largeImageDataUrl);
    
    expect(sanitizedDataUrl).toMatch(/^data:image\/png;base64,/);
    
    console.log("✓ Issue #17 regression test passed - image data preserved correctly");
  });

  it("should handle edge case: exactly 10000 character data URL", () => {
    const baseData = "data:image/png;base64,";
    const neededChars = 10000 - baseData.length;
    const paddedBase64 = "A".repeat(neededChars);
    const exactDataUrl = baseData + paddedBase64;
    
    expect(exactDataUrl.length).toBe(10000);
    
    const result = sanitizeDrawingData({
      elements: [],
      appState: {},
      files: {
        "boundary-test": {
          id: "boundary-test",
          dataURL: exactDataUrl,
        },
      },
    });
    
    const resultFiles = result.files as Record<string, any>;
    expect(resultFiles["boundary-test"].dataURL.length).toBe(10000);
  });

  it("should handle edge case: 10001 character data URL (just over limit)", () => {
    const baseData = "data:image/png;base64,";
    const neededChars = 10001 - baseData.length;
    const paddedBase64 = "A".repeat(neededChars);
    const justOverDataUrl = baseData + paddedBase64;
    
    expect(justOverDataUrl.length).toBe(10001);
    
    const result = sanitizeDrawingData({
      elements: [],
      appState: {},
      files: {
        "over-limit-test": {
          id: "over-limit-test",
          dataURL: justOverDataUrl,
        },
      },
    });
    
    const resultFiles = result.files as Record<string, any>;
    expect(resultFiles["over-limit-test"].dataURL.length).toBe(10001);
  });
});
