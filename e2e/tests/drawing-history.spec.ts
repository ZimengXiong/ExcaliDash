import { test, expect } from "@playwright/test";
import {
  API_URL,
  createDrawing,
  updateDrawing,
  deleteDrawing,
  getDrawing,
  getCsrfHeaders,
} from "./helpers/api";

test.describe("Drawing Version History", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {}
    }
    createdDrawingIds = [];
  });

  test("should create snapshots on scene updates", async ({ request }) => {
    // Create a drawing
    const drawing = await createDrawing(request, { name: "History Test" });
    createdDrawingIds.push(drawing.id);

    // No history initially
    const historyBefore = await request.get(
      `${API_URL}/drawings/${drawing.id}/history`
    );
    expect(historyBefore.ok()).toBe(true);
    const beforeData = await historyBefore.json();
    const initialCount = beforeData.totalCount;

    // Make a scene update
    await updateDrawing(request, drawing.id, {
      elements: [
        { id: "el-1", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
      ] as any,
      version: drawing.version,
    });

    // Now there should be a snapshot
    const historyAfter = await request.get(
      `${API_URL}/drawings/${drawing.id}/history`
    );
    expect(historyAfter.ok()).toBe(true);
    const afterData = await historyAfter.json();
    expect(afterData.totalCount).toBe(initialCount + 1);
    expect(afterData.snapshots.length).toBeGreaterThan(0);
    expect(afterData.snapshots[0]).toHaveProperty("id");
    expect(afterData.snapshots[0]).toHaveProperty("version");
    expect(afterData.snapshots[0]).toHaveProperty("createdAt");
  });

  test("should not create snapshots for non-scene updates", async ({
    request,
  }) => {
    const drawing = await createDrawing(request, { name: "No Snapshot Test" });
    createdDrawingIds.push(drawing.id);

    const historyBefore = await request.get(
      `${API_URL}/drawings/${drawing.id}/history`
    );
    const beforeData = await historyBefore.json();
    const initialCount = beforeData.totalCount;

    // Name-only update (not a scene update)
    await updateDrawing(request, drawing.id, { name: "Renamed" } as any);

    const historyAfter = await request.get(
      `${API_URL}/drawings/${drawing.id}/history`
    );
    const afterData = await historyAfter.json();
    expect(afterData.totalCount).toBe(initialCount);
  });

  test("should return full snapshot data for preview", async ({ request }) => {
    const drawing = await createDrawing(request, {
      name: "Preview Test",
      elements: [
        { id: "original", type: "ellipse", x: 10, y: 20, width: 50, height: 50 },
      ] as any,
    });
    createdDrawingIds.push(drawing.id);

    // Update to create a snapshot
    await updateDrawing(request, drawing.id, {
      elements: [
        { id: "updated", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
      ] as any,
      version: drawing.version,
    });

    // Get history
    const historyResp = await request.get(
      `${API_URL}/drawings/${drawing.id}/history`
    );
    const history = await historyResp.json();
    expect(history.snapshots.length).toBeGreaterThan(0);

    const snapshotId = history.snapshots[0].id;

    // Get full snapshot
    const snapshotResp = await request.get(
      `${API_URL}/drawings/${drawing.id}/history/${snapshotId}`
    );
    expect(snapshotResp.ok()).toBe(true);
    const snapshot = await snapshotResp.json();

    expect(snapshot.id).toBe(snapshotId);
    expect(snapshot.drawingId).toBe(drawing.id);
    expect(Array.isArray(snapshot.elements)).toBe(true);
    expect(snapshot).toHaveProperty("appState");
    expect(snapshot).toHaveProperty("files");
  });

  test("should restore a snapshot and backup current state", async ({
    request,
  }) => {
    // Create drawing with initial elements
    const drawing = await createDrawing(request, {
      name: "Restore Test",
      elements: [
        { id: "v1-el", type: "rectangle", x: 0, y: 0, width: 50, height: 50 },
      ] as any,
    });
    createdDrawingIds.push(drawing.id);

    // Update to create a snapshot of v1
    await updateDrawing(request, drawing.id, {
      elements: [
        { id: "v2-el", type: "ellipse", x: 100, y: 100, width: 80, height: 80 },
      ] as any,
      version: drawing.version,
    });

    // Get snapshot (should be v1 state)
    const historyResp = await request.get(
      `${API_URL}/drawings/${drawing.id}/history`
    );
    const history = await historyResp.json();
    const snapshotId = history.snapshots[0].id;

    // Count snapshots before restore
    const countBefore = history.totalCount;

    // Restore
    const headers = await getCsrfHeaders(request);
    const restoreResp = await request.post(
      `${API_URL}/drawings/${drawing.id}/history/${snapshotId}/restore`,
      { headers }
    );
    expect(restoreResp.ok()).toBe(true);

    // Verify drawing was restored
    const restored = await getDrawing(request, drawing.id);
    expect(restored.elements).toBeDefined();

    // Verify a backup snapshot was created (count should increase by 1)
    const historyAfter = await request.get(
      `${API_URL}/drawings/${drawing.id}/history`
    );
    const afterData = await historyAfter.json();
    expect(afterData.totalCount).toBe(countBefore + 1);
  });

  test("should return 404 for non-existent snapshot", async ({ request }) => {
    const drawing = await createDrawing(request, { name: "404 Test" });
    createdDrawingIds.push(drawing.id);

    const resp = await request.get(
      `${API_URL}/drawings/${drawing.id}/history/nonexistent-id`
    );
    expect(resp.status()).toBe(404);
  });

  test("should cascade-delete snapshots when drawing is deleted", async ({
    request,
  }) => {
    const drawing = await createDrawing(request, {
      name: "Cascade Test",
    });
    // Don't add to createdDrawingIds — we delete manually

    // Create a snapshot
    await updateDrawing(request, drawing.id, {
      elements: [{ id: "el", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }] as any,
      version: drawing.version,
    });

    // Verify snapshot exists
    const historyResp = await request.get(
      `${API_URL}/drawings/${drawing.id}/history`
    );
    const history = await historyResp.json();
    expect(history.totalCount).toBeGreaterThan(0);

    // Delete drawing
    await deleteDrawing(request, drawing.id);

    // History endpoint should return 404 (drawing gone)
    const afterResp = await request.get(
      `${API_URL}/drawings/${drawing.id}/history`
    );
    expect(afterResp.status()).toBe(404);
  });

  test("should show history button in editor", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: "UI History Test" });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", {
      timeout: 15000,
    });

    // Trigger header visibility (may be auto-hidden)
    await page.mouse.move(640, 10);
    await page.waitForTimeout(500);

    const historyButton = page.locator('button[title="Version History"]');
    await expect(historyButton).toBeAttached();
  });
});
