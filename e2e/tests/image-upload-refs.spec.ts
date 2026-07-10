import { test, expect } from "@playwright/test";
import { API_URL, createDrawing, deleteDrawing, getDrawing } from "./helpers/api";

/**
 * E2E Browser Tests for image-upload ref behavior.
 *
 * After an image is uploaded out-of-band via the per-file endpoint, scene-save
 * PUTs must carry only a small metadata + ref payload rather than the inline
 * base64 bytes. Split out of image-persistence.spec.ts to keep files under the
 * repo line-count gate.
 */

test.describe("Image upload - metadata-only scene saves", () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
        /* best effort */
      }
    }
    createdIds.length = 0;
  });

  test("scene save after inserting a large image stays under ~200KB", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);
    const drawing = await createDrawing(request, {
      name: `E2E_UploadRef_${Date.now()}`,
      elements: [],
      files: {},
    });
    createdIds.push(drawing.id);

    // Record the byte size of every scene-save PUT (not the /files/ upload,
    // not /preview). After the image is uploaded out-of-band, these must shrink
    // to a small metadata + ref payload rather than the inline base64 bytes.
    const sceneSaveSizes: number[] = [];
    const sceneSaveRe = new RegExp(`/api/drawings/${drawing.id}$`);
    page.on("request", (req) => {
      if (req.method() === "PUT" && sceneSaveRe.test(req.url())) {
        sceneSaveSizes.push((req.postData() || "").length);
      }
    });

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", {
      timeout: 15000,
    });
    await page.waitForFunction(
      () => !!(window as any).__EXCALIDASH_EXCALIDRAW_API__,
    );

    // Insert a ~400KB (raw) image that does not compress (fake PNG bytes) so an
    // inline save would be clearly over the 200KB threshold.
    const { fileId } = await page.evaluate(() => {
      const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
      const b64 = btoa("A".repeat(400000));
      const dataURL = `data:image/png;base64,${b64}`;
      const fileId = `bigimg_${Math.random().toString(36).slice(2)}`;
      const elementId = `el_${Math.random().toString(36).slice(2)}`;
      const now = Date.now();
      const before = api.getSceneElementsIncludingDeleted();
      api.updateScene({
        elements: [
          ...before,
          {
            id: elementId,
            type: "image",
            x: 40,
            y: 40,
            width: 200,
            height: 200,
            angle: 0,
            strokeColor: "#1e1e1e",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 1,
            strokeStyle: "solid",
            roundness: null,
            roughness: 0,
            opacity: 100,
            groupIds: [],
            frameId: null,
            seed: 1,
            version: 1,
            versionNonce: 1,
            isDeleted: false,
            boundElements: null,
            link: null,
            locked: false,
            index: "a1",
            updated: now,
            status: "pending",
            fileId,
            scale: [1, 1],
            crop: null,
          },
        ],
      });
      api.addFiles({
        [fileId]: { id: fileId, mimeType: "image/png", dataURL, created: now },
      });
      return { fileId };
    });

    // Wait for the per-file upload to complete so the ref is recorded.
    await page.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        res.url().includes(`/drawings/${drawing.id}/files/${fileId}`) &&
        res.status() < 400,
      { timeout: 20000 },
    );

    // Force one more scene save now that the ref exists, then let the 1s
    // debounce fire. The final save must carry the ref, not the base64 bytes.
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
      const els = api.getSceneElementsIncludingDeleted();
      api.updateScene({
        elements: [
          ...els,
          {
            id: `r_${Math.random().toString(36).slice(2)}`,
            type: "rectangle",
            x: 300, y: 300, width: 10, height: 10, angle: 0,
            strokeColor: "#1e1e1e", backgroundColor: "transparent",
            fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid",
            roundness: null, roughness: 0, opacity: 100,
            groupIds: [], frameId: null, seed: 2, version: 1,
            versionNonce: 2, isDeleted: false, boundElements: null,
            link: null, locked: false, index: "a2", updated: Date.now(),
          },
        ],
      });
    });
    await page.waitForTimeout(2500);

    expect(sceneSaveSizes.length).toBeGreaterThan(0);
    const lastSave = sceneSaveSizes[sceneSaveSizes.length - 1];
    expect(lastSave).toBeLessThan(200_000);

    // The image is still persisted (as a ref) and reloads correctly.
    const persisted = await getDrawing(request, drawing.id);
    expect(persisted.files?.[fileId]).toBeDefined();
    expect(typeof persisted.files?.[fileId]?.dataURL).toBe("string");

    // In database storage mode GET /api/files streams the bytes with immutable
    // caching so revisits paint from cache (304/hit) with zero transfer. In S3
    // mode the same endpoint 302-redirects to a presigned URL that carries its
    // own immutable headers, so only assert on the direct byte response.
    const fileRes = await request.get(
      `${API_URL}/files/${drawing.id}/${fileId}`,
      { maxRedirects: 0 },
    );
    if (fileRes.status() === 200) {
      const cacheControl = fileRes.headers()["cache-control"] || "";
      expect(cacheControl).toContain("immutable");
      expect(fileRes.headers()["etag"]).toBeTruthy();
    }
  });
});
