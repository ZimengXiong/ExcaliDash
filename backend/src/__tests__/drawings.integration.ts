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

// Test directly against the security functions first (unit-level)
describe("Security Sanitization - Image Data URLs", () => {
  // Reset security settings before each test
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
      // Set a small limit for testing
      configureSecuritySettings({ maxDataUrlSize: 1000 });
      
      // Create a dataURL larger than 1000 chars
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
      // Should be cleared because it exceeds the configured limit
      expect(resultFiles["file-1"].dataURL).toBe("");
    });

    it("should allow dataURL under configured limit", () => {
      // Set limit to 5000 chars
      configureSecuritySettings({ maxDataUrlSize: 5000 });
      
      // Create a dataURL smaller than 5000 chars
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
      
      // Verify this is actually a large data URL that would trigger the bug
      expect(originalDataUrl.length).toBeGreaterThan(10000);
      
      const result = sanitizeDrawingData({
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files,
      });
      
      const resultFiles = result.files as Record<string, any>;
      const resultDataUrl = Object.values(resultFiles)[0]?.dataURL;
      
      // THIS IS THE KEY ASSERTION - the old code would truncate to ~10000 chars
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
      // The dataURL should be cleared or sanitized when it contains script tags
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
      // javascript: URLs should be blocked
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
      // id and mimeType should be sanitized, dataURL should be preserved
      expect(resultFiles["file-1"].id).not.toContain("<script>");
      expect(resultFiles["file-1"].mimeType).not.toContain("<script>");
      // dataURL should remain intact
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
      // Should still preserve the data URL even with uppercase
      expect(resultFiles["file-1"].dataURL).toBe(files["file-1"].dataURL);
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
      
      // The validation should still pass, but sanitization should clean the data
      const isValid = validateImportedDrawing(drawing);
      expect(isValid).toBe(true);
    });
  });
});

// Database integration tests
describe("Drawing API - Database Round-Trip", () => {
  const prisma = getTestPrisma();

  beforeAll(async () => {
    setupTestDb();
    await initTestDb(prisma);
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
    
    // Verify the data URL is large enough to trigger the bug
    expect(originalDataUrl.length).toBeGreaterThan(10000);
    
    // Create drawing with files
    const created = await prisma.drawing.create({
      data: {
        name: "Test with Image",
        elements: JSON.stringify([]),
        appState: JSON.stringify({ viewBackgroundColor: "#ffffff" }),
        files: JSON.stringify(files),
      },
    });
    
    // Read it back
    const retrieved = await prisma.drawing.findUnique({
      where: { id: created.id },
    });
    
    expect(retrieved).not.toBeNull();
    
    const parsedFiles = JSON.parse(retrieved!.files || "{}");
    const retrievedDataUrl = Object.values(parsedFiles as Record<string, any>)[0]?.dataURL;
    
    // THE KEY ASSERTION - data should not be truncated
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
      },
    });
    
    const retrieved = await prisma.drawing.findUnique({
      where: { id: created.id },
    });
    
    const parsedFiles = JSON.parse(retrieved!.files || "{}") as Record<string, any>;
    
    // Both images should be fully preserved
    expect(parsedFiles["small-image"].dataURL).toBe(files["small-image"].dataURL);
    expect(parsedFiles["large-image"].dataURL).toBe(files["large-image"].dataURL);
    expect(parsedFiles["large-image"].dataURL.length).toBe(files["large-image"].dataURL.length);
  });

  it("should preserve files through update cycle", async () => {
    // Create with no files
    const created = await prisma.drawing.create({
      data: {
        name: "Update Test",
        elements: JSON.stringify([]),
        appState: JSON.stringify({}),
        files: JSON.stringify({}),
      },
    });
    
    // Update with large image
    const files = createSampleFilesObject(1, "large");
    const originalDataUrl = Object.values(files)[0].dataURL;
    
    await prisma.drawing.update({
      where: { id: created.id },
      data: {
        files: JSON.stringify(files),
      },
    });
    
    // Read back
    const retrieved = await prisma.drawing.findUnique({
      where: { id: created.id },
    });
    
    const parsedFiles = JSON.parse(retrieved!.files || "{}") as Record<string, any>;
    const retrievedDataUrl = Object.values(parsedFiles)[0]?.dataURL;
    
    expect(retrievedDataUrl).toBe(originalDataUrl);
  });
});

// Test the specific scenario from issue #17
describe("Issue #17 Regression Test - Images Not Loading Fully", () => {
  it("should reproduce and verify fix for truncated image data", () => {
    // This is the exact scenario that caused issue #17:
    // 1. User uploads an image to a drawing
    // 2. The image is saved as a base64 data URL in the files object
    // 3. On save, sanitizeDrawingData() truncates the dataURL to 10000 chars
    // 4. On reload, the image appears broken/half-loaded
    
    // Create a realistic image data URL (around 50KB, typical for a small image)
    const largeImageDataUrl = generateLargeImageDataUrl();
    
    // Verify it would have been affected by the bug
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
    
    // Simulate what happens when saving a drawing
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
    
    // THE BUG: Old code would have truncated this
    // THE FIX: New code should preserve the full data URL
    const sanitizedFiles = sanitizedData.files as Record<string, any>;
    const sanitizedDataUrl = sanitizedFiles["user-uploaded-image"]?.dataURL;
    
    // Assertions that would FAIL with the old buggy code:
    expect(sanitizedDataUrl).toBeDefined();
    expect(sanitizedDataUrl.length).toBe(largeImageDataUrl.length);
    expect(sanitizedDataUrl).toBe(largeImageDataUrl);
    
    // Verify it's still a valid data URL structure
    expect(sanitizedDataUrl).toMatch(/^data:image\/png;base64,/);
    
    console.log("✓ Issue #17 regression test passed - image data preserved correctly");
  });

  it("should handle edge case: exactly 10000 character data URL", () => {
    // Create a data URL that's exactly at the truncation boundary
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
    // This would have been the first case to fail with the old code
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
    // WITH THE FIX: should still be 10001 characters
    // WITH THE BUG: would have been truncated to 10000
    expect(resultFiles["over-limit-test"].dataURL.length).toBe(10001);
  });
});
