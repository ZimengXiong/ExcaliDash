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
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64Data = "";
  for (let i = 0; i < sizeInBytes; i++) {
    base64Data += base64Chars[Math.floor(Math.random() * 64)];
  }
  return `data:image/png;base64,${base64Data}`;
}

const expectStoredImage = async (
  request: import("@playwright/test").APIRequestContext,
  drawingId: string,
  fileId: string,
  storedFile: any,
  originalDataUrl: string,
) => {
  expect(storedFile).toBeDefined();
  expect(storedFile.dataURL).toBe(`/api/files/${drawingId}/${fileId}`);
  const response = await request.get(
    `${API_URL}${storedFile.dataURL.replace(/^\/api/, "")}`,
  );
  expect(response.ok()).toBe(true);
  expect(await response.body()).toEqual(
    Buffer.from(originalDataUrl.split(",", 2)[1], "base64"),
  );
};

test.describe("Image Persistence - Browser E2E Tests", () => {
  let testDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of testDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    testDrawingIds = [];
  });

  test("should navigate to dashboard and see drawing list", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/ExcaliDash/i);

    await expect(page.locator("body")).toBeVisible();
  });

  test("should create a new drawing via UI", async ({ page }) => {
    await page.goto("/");

    const newDrawingBtn = page.getByRole("button", { name: /new|create/i }).first();

    if (await newDrawingBtn.isVisible()) {
      await newDrawingBtn.click();
      await page.getByTestId("engine-card-excalidraw").click();
      await expect(page).toHaveURL(/\/editor\//);
    }
  });

  test("should preserve large image data through save/reload cycle via API", async ({ request }) => {
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

    const createdDrawing = await createDrawing(request, {
      name: "E2E Test - Large Image",
      files,
    });
    testDrawingIds.push(createdDrawing.id);

    const drawing = await getDrawing(request, createdDrawing.id);
    const savedFiles = drawing.files || {};  // Already parsed by API

    await expectStoredImage(
      request,
      createdDrawing.id,
      "test-image-1",
      savedFiles["test-image-1"],
      largeDataUrl,
    );

    console.log("✓ Large image data preserved correctly through save/reload cycle");
  });

  test("should display drawing in editor view", async ({ page, request }) => {
    const createdDrawing = await createDrawing(request, {
      name: "E2E Test - Editor View",
    });
    testDrawingIds.push(createdDrawing.id);

    await page.goto(`/editor/${createdDrawing.id}`);

    await page.waitForLoadState("networkidle");

    const editorContainer = page.locator("[class*='excalidraw'], canvas").first();
    await expect(editorContainer).toBeVisible({ timeout: 10000 });
  });

  test("should import .excalidraw file with embedded image", async ({ request }) => {
    const fixturePath = path.join(__dirname, "..", "fixtures", "small-image.excalidraw");
    const fixtureContent = fs.readFileSync(fixturePath, "utf-8");
    const fixtureData = JSON.parse(fixtureContent);

    const createdDrawing = await createDrawing(request, {
      name: "E2E Test - Imported Image",
      files: fixtureData.files,
    });
    testDrawingIds.push(createdDrawing.id);

    const drawing = await getDrawing(request, createdDrawing.id);
    const savedFiles = drawing.files || {};  // Already parsed by API

    await expectStoredImage(
      request,
      createdDrawing.id,
      "embedded-test-image",
      savedFiles["embedded-test-image"],
      fixtureData.files["embedded-test-image"].dataURL,
    );
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

    for (const [id, originalFile] of Object.entries(files)) {
      await expectStoredImage(
        request,
        createdDrawing.id,
        id,
        savedFiles[id],
        (originalFile as any).dataURL,
      );
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

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringMatching(/invalid image reference/i),
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

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringMatching(/invalid or unsupported image data URL/i),
    });
  });
});
