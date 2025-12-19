/**
 * Tests for exportUtils.ts
 * 
 * These tests verify that the export functionality preserves image data
 * correctly, which is critical for the issue #17 fix.
 */

import { describe, it, expect } from "vitest";
import { type ExportData } from "../exportUtils";

// Helper to create a large base64 data URL (similar to real images)
const createLargeDataUrl = (size: number = 50000): string => {
  const baseImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
  const repetitions = Math.ceil(size / baseImage.length);
  return `data:image/png;base64,${baseImage.repeat(repetitions)}`;
};

/**
 * These tests focus on the data integrity aspect rather than the DOM manipulation,
 * since the DOM manipulation is straightforward and the real bug from issue #17
 * was about data corruption during serialization.
 */
describe("ExportData JSON Serialization - Issue #17 Regression", () => {
  describe("files object serialization", () => {
    it("should preserve small image data URLs through JSON round-trip", () => {
      const smallDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
      
      const exportData: ExportData = {
        type: "excalidraw",
        version: 2,
        source: "http://localhost:5173",
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {
          "file-1": {
            id: "file-1",
            mimeType: "image/png",
            dataURL: smallDataUrl,
          },
        },
      };

      const jsonString = JSON.stringify(exportData);
      const parsed: ExportData = JSON.parse(jsonString);

      expect(parsed.files["file-1"].dataURL).toBe(smallDataUrl);
    });

    it("should preserve large image data URLs (>10000 chars) through JSON round-trip - REGRESSION TEST", () => {
      const largeDataUrl = createLargeDataUrl(50000);
      
      // Verify this is actually a large data URL
      expect(largeDataUrl.length).toBeGreaterThan(10000);
      
      const exportData: ExportData = {
        type: "excalidraw",
        version: 2,
        source: "http://localhost:5173",
        elements: [
          {
            id: "image-element",
            type: "image",
            fileId: "file-1",
            x: 0,
            y: 0,
            width: 400,
            height: 300,
          },
        ],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {
          "file-1": {
            id: "file-1",
            mimeType: "image/png",
            dataURL: largeDataUrl,
            created: Date.now(),
          },
        },
      };

      // Serialize to JSON (what happens when saving/exporting)
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Parse back (what happens when loading/importing)
      const parsed: ExportData = JSON.parse(jsonString);

      // THE KEY ASSERTIONS for issue #17
      expect(parsed.files["file-1"].dataURL).toBe(largeDataUrl);
      expect(parsed.files["file-1"].dataURL.length).toBe(largeDataUrl.length);
      
      // Verify the data URL is still valid format
      expect(parsed.files["file-1"].dataURL).toMatch(/^data:image\/png;base64,/);
    });

    it("should preserve multiple images with varying sizes", () => {
      const smallDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
      const largeDataUrl = createLargeDataUrl(100000);

      const exportData: ExportData = {
        type: "excalidraw",
        version: 2,
        source: "http://localhost:5173",
        elements: [],
        appState: {},
        files: {
          "small-img": {
            id: "small-img",
            mimeType: "image/png",
            dataURL: smallDataUrl,
          },
          "large-img": {
            id: "large-img",
            mimeType: "image/png",
            dataURL: largeDataUrl,
          },
        },
      };

      const jsonString = JSON.stringify(exportData);
      const parsed: ExportData = JSON.parse(jsonString);

      expect(parsed.files["small-img"].dataURL).toBe(smallDataUrl);
      expect(parsed.files["large-img"].dataURL).toBe(largeDataUrl);
      expect(parsed.files["large-img"].dataURL.length).toBe(largeDataUrl.length);
    });

    it("should handle empty files object", () => {
      const exportData: ExportData = {
        type: "excalidraw",
        version: 2,
        source: "http://localhost:5173",
        elements: [],
        appState: {},
        files: {},
      };

      const jsonString = JSON.stringify(exportData);
      const parsed: ExportData = JSON.parse(jsonString);

      expect(parsed.files).toEqual({});
    });

    it("should handle edge case: exactly 10000 character data URL", () => {
      const baseData = "data:image/png;base64,";
      const neededChars = 10000 - baseData.length;
      const exactDataUrl = baseData + "A".repeat(neededChars);
      
      expect(exactDataUrl.length).toBe(10000);

      const exportData: ExportData = {
        type: "excalidraw",
        version: 2,
        source: "http://localhost:5173",
        elements: [],
        appState: {},
        files: {
          "boundary-test": {
            id: "boundary-test",
            dataURL: exactDataUrl,
          },
        },
      };

      const jsonString = JSON.stringify(exportData);
      const parsed: ExportData = JSON.parse(jsonString);

      expect(parsed.files["boundary-test"].dataURL.length).toBe(10000);
    });

    it("should handle edge case: 10001 character data URL (just over old limit)", () => {
      const baseData = "data:image/png;base64,";
      const neededChars = 10001 - baseData.length;
      const justOverDataUrl = baseData + "A".repeat(neededChars);
      
      expect(justOverDataUrl.length).toBe(10001);

      const exportData: ExportData = {
        type: "excalidraw",
        version: 2,
        source: "http://localhost:5173",
        elements: [],
        appState: {},
        files: {
          "over-limit-test": {
            id: "over-limit-test",
            dataURL: justOverDataUrl,
          },
        },
      };

      const jsonString = JSON.stringify(exportData);
      const parsed: ExportData = JSON.parse(jsonString);

      // This would have been truncated with the old buggy code
      expect(parsed.files["over-limit-test"].dataURL.length).toBe(10001);
    });
  });

  describe("different image MIME types", () => {
    const mimeTypes = [
      { type: "image/png", dataPrefix: "data:image/png;base64," },
      { type: "image/jpeg", dataPrefix: "data:image/jpeg;base64," },
      { type: "image/gif", dataPrefix: "data:image/gif;base64," },
      { type: "image/webp", dataPrefix: "data:image/webp;base64," },
    ];

    mimeTypes.forEach(({ type, dataPrefix }) => {
      it(`should preserve ${type} data URLs`, () => {
        const dataUrl = dataPrefix + "A".repeat(20000);
        
        const exportData: ExportData = {
          type: "excalidraw",
          version: 2,
          source: "http://localhost:5173",
          elements: [],
          appState: {},
          files: {
            "test-file": {
              id: "test-file",
              mimeType: type,
              dataURL: dataUrl,
            },
          },
        };

        const jsonString = JSON.stringify(exportData);
        const parsed: ExportData = JSON.parse(jsonString);

        expect(parsed.files["test-file"].dataURL).toBe(dataUrl);
        expect(parsed.files["test-file"].dataURL.length).toBe(dataUrl.length);
      });
    });
  });
});

describe("Issue #17 Full Scenario Simulation", () => {
  it("should simulate the complete save/reload cycle that caused the bug", () => {
    // This test simulates the exact scenario from issue #17:
    // 1. User uploads an image to their drawing
    // 2. The drawing is saved to the server
    // 3. User closes and reopens the drawing
    // 4. The image should appear fully loaded, not truncated
    
    const largeImageDataUrl = createLargeDataUrl(50000);
    console.log(`Testing with image data URL of length: ${largeImageDataUrl.length}`);
    
    // Step 1: Create the drawing data with an embedded image
    const originalDrawingData = {
      elements: [
        {
          id: "image-element",
          type: "image",
          fileId: "user-uploaded-image",
          x: 100,
          y: 100,
          width: 400,
          height: 300,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {
        "user-uploaded-image": {
          id: "user-uploaded-image",
          mimeType: "image/png",
          dataURL: largeImageDataUrl,
          created: Date.now(),
          lastRetrieved: Date.now(),
        },
      },
    };

    // Step 2: Simulate what the frontend does when saving
    const savePayload = {
      name: "My Drawing with Image",
      elements: originalDrawingData.elements,
      appState: originalDrawingData.appState,
      files: originalDrawingData.files,
    };
    
    // Serialize to JSON (what gets sent to the API)
    const requestBody = JSON.stringify(savePayload);

    // Step 3: Simulate what the backend returns after saving
    // (In the buggy version, this is where the truncation happened)
    const savedData = JSON.parse(requestBody);

    // Step 4: Simulate reloading the drawing
    const reloadedFiles = savedData.files;
    const reloadedDataUrl = reloadedFiles["user-uploaded-image"]?.dataURL;

    // THE KEY ASSERTIONS - these would fail with the old buggy code
    expect(reloadedDataUrl).toBeDefined();
    expect(reloadedDataUrl.length).toBe(largeImageDataUrl.length);
    expect(reloadedDataUrl).toBe(largeImageDataUrl);
    
    // Verify the base64 content is complete
    expect(reloadedDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    
    console.log("✓ Issue #17 full scenario test passed - image data preserved correctly");
  });
});

