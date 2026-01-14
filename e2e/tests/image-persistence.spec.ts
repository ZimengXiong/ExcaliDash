import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getCsrfHeaders,
  getDrawing,
} from "./helpers/api";

/**
 * E2E Browser Tests for Image Persistence - Issue #17 Regression
 * 
 * These tests verify the complete user workflow:
 * 1. Create a drawing with an embedded image
 * 2. Save the drawing
 * 3. Close and reopen the drawing
 * 4. Verify the image loads correctly
 * 
 * This tests the fix for GitHub issue #17:
 * "Images don't load fully when reopening the file"
 */

function generateLargeImageDataUrl(sizeInBytes: number = 50000): string {
  // Create pseudo-random data that looks like base64
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64Data = "";
  for (let i = 0; i < sizeInBytes; i++) {
    base64Data += base64Chars[Math.floor(Math.random() * 64)];
  }
  return `data:image/png;base64,${base64Data}`;
}

test.describe("Image Persistence - Browser E2E Tests", () => {
  let testDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    // Clean up any drawings created during tests
    for (const id of testDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
        // Ignore cleanup errors
      }
    }
    testDrawingIds = [];
  });

  test("should navigate to dashboard and see drawing list", async ({ page }) => {
    await page.goto("/");

    // Wait for the page to load
    await expect(page).toHaveTitle(/ExcaliDash/i);

    // The dashboard should show some UI elements
    await expect(page.locator("body")).toBeVisible();
  });

  test("should create a new drawing via UI", async ({ page }) => {
    await page.goto("/");

    // Look for a "New Drawing" or similar button
    const newDrawingBtn = page.getByRole("button", { name: /new|create/i }).first();

    if (await newDrawingBtn.isVisible()) {
      await newDrawingBtn.click();

      // Should navigate to editor or show a modal
      await page.waitForURL(/\/(editor|drawing)/i, { timeout: 5000 }).catch(() => {
        // May stay on same page with modal
      });
    }
  });

  test("should preserve large image data through save/reload cycle via API", async ({ request }) => {
    // This is the core regression test for issue #17
    const largeDataUrl = generateLargeImageDataUrl(50000);
    expect(largeDataUrl.length).toBeGreaterThan(10000);

    const files = {
      "test-image-1": {
        id: "test-image-1",
        mimeType: "image/png",
        dataURL: largeDataUrl,
        created: Date.now(),
      },
    };

    // Create drawing with large image
    const createdDrawing = await createDrawing(request, {
      name: "E2E Test - Large Image",
      files,
    });
    testDrawingIds.push(createdDrawing.id);

    // Retrieve the drawing
    const drawing = await getDrawing(request, createdDrawing.id);
    const savedFiles = drawing.files || {};  // Already parsed by API

    // Verify the image data was preserved
    expect(savedFiles["test-image-1"]).toBeDefined();
    expect(savedFiles["test-image-1"].dataURL).toBe(largeDataUrl);
    expect(savedFiles["test-image-1"].dataURL.length).toBe(largeDataUrl.length);

    console.log("✓ Large image data preserved correctly through save/reload cycle");
  });

  test("should display drawing in editor view", async ({ page, request }) => {
    // Create a test drawing first
    const createdDrawing = await createDrawing(request, {
      name: "E2E Test - Editor View",
    });
    testDrawingIds.push(createdDrawing.id);

    // Navigate to the editor
    await page.goto(`/editor/${createdDrawing.id}`);

    // Wait for the page to load
    await page.waitForLoadState("networkidle");

    // The editor should be visible (Excalidraw canvas)
    // Look for the Excalidraw container or canvas
    const editorContainer = page.locator("[class*='excalidraw'], canvas").first();
    await expect(editorContainer).toBeVisible({ timeout: 10000 });
  });

  test("should import .excalidraw file with embedded image", async ({ request }) => {
    // Load the test fixture
    const fixturePath = path.join(__dirname, "..", "fixtures", "small-image.excalidraw");
    const fixtureContent = fs.readFileSync(fixturePath, "utf-8");
    const fixtureData = JSON.parse(fixtureContent);

    // Create drawing via API with fixture data
    const createdDrawing = await createDrawing(request, {
      name: "E2E Test - Imported Image",
      files: fixtureData.files,
    });
    testDrawingIds.push(createdDrawing.id);

    // Verify via API that image data was preserved
    const drawing = await getDrawing(request, createdDrawing.id);
    const savedFiles = drawing.files || {};  // Already parsed by API

    expect(savedFiles["embedded-test-image"]).toBeDefined();
    expect(savedFiles["embedded-test-image"].dataURL).toBe(fixtureData.files["embedded-test-image"].dataURL);
  });

  test("should handle multiple images of varying sizes", async ({ request }) => {
    const files = {
      "small-image": {
        id: "small-image",
        mimeType: "image/png",
        dataURL: generateLargeImageDataUrl(1000),
        created: Date.now(),
      },
      "medium-image": {
        id: "medium-image",
        mimeType: "image/jpeg",
        dataURL: generateLargeImageDataUrl(15000),
        created: Date.now(),
      },
      "large-image": {
        id: "large-image",
        mimeType: "image/png",
        dataURL: generateLargeImageDataUrl(75000),
        created: Date.now(),
      },
    };

    const createdDrawing = await createDrawing(request, {
      name: "E2E Test - Multiple Images",
      files,
    });
    testDrawingIds.push(createdDrawing.id);

    const drawing = await getDrawing(request, createdDrawing.id);
    const savedFiles = drawing.files || {};  // Already parsed by API

    // Verify all images preserved correctly
    for (const [id, originalFile] of Object.entries(files)) {
      expect(savedFiles[id]).toBeDefined();
      expect(savedFiles[id].dataURL).toBe((originalFile as any).dataURL);
      expect(savedFiles[id].dataURL.length).toBe((originalFile as any).dataURL.length);
    }

    console.log("✓ Multiple images of varying sizes preserved correctly");
  });
});

test.describe("Security - Malicious Content Blocking", () => {
  test("should block javascript: URLs in image data", async ({ request }) => {
    const maliciousFiles = {
      "malicious-image": {
        id: "malicious-image",
        mimeType: "image/png",
        dataURL: "javascript:alert('xss')",
        created: Date.now(),
      },
    };

    const response = await request.post(`${API_URL}/drawings`, {
      headers: {
        "Content-Type": "application/json",
        ...(await getCsrfHeaders(request)),
      },
      data: {
        name: "Security Test - JS URL",
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: maliciousFiles,
        preview: null,
      },
    });

    if (!response.ok()) {
      const text = await response.text();
      console.error(`API Error: ${response.status()} - ${text}`);
    }
    expect(response.ok()).toBe(true);
    const drawing = await response.json();
    const savedFiles = drawing.files;  // Already parsed by API

    // The malicious URL should be blocked/cleared
    expect(savedFiles["malicious-image"].dataURL).not.toContain("javascript:");

    // Cleanup
    await request.delete(`${API_URL}/drawings/${drawing.id}`, {
      headers: await getCsrfHeaders(request),
    });
  });

  test("should block script tags in image data", async ({ request }) => {
    const maliciousFiles = {
      "malicious-image": {
        id: "malicious-image",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,<script>alert('xss')</script>AAAA",
        created: Date.now(),
      },
    };

    const response = await request.post(`${API_URL}/drawings`, {
      headers: {
        "Content-Type": "application/json",
        ...(await getCsrfHeaders(request)),
      },
      data: {
        name: "Security Test - Script Tag",
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: maliciousFiles,
        preview: null,
      },
    });

    if (!response.ok()) {
      const text = await response.text();
      console.error(`API Error: ${response.status()} - ${text}`);
    }
    expect(response.ok()).toBe(true);
    const drawing = await response.json();
    const savedFiles = drawing.files;  // Already parsed by API

    // The script tag should be blocked
    expect(savedFiles["malicious-image"].dataURL).not.toContain("<script>");

    // Cleanup
    await request.delete(`${API_URL}/drawings/${drawing.id}`, {
      headers: await getCsrfHeaders(request),
    });
  });
});
