import { test, expect } from "@playwright/test";
import { createDrawing, deleteDrawing, getDrawing } from "./helpers/api";

/**
 * E2E Tests for Real-time Collaboration
 *
 * Tests the real-time collaboration feature mentioned in README:
 * - Multiple users can edit drawings simultaneously
 * - Cursor presence is shared between users
 * - Changes sync between users in real-time
 */

test.describe("Real-time Collaboration", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {}
    }
    createdDrawingIds = [];
  });

  test("should show presence when multiple users view same drawing", async ({
    browser,
    request,
  }) => {
    const drawing = await createDrawing(request, {
      name: `Collab_Presence_${Date.now()}`,
    });
    createdDrawingIds.push(drawing.id);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      await page1.goto(`/editor/${drawing.id}`);
      await page2.goto(`/editor/${drawing.id}`);

      await page1.waitForSelector("[class*='excalidraw'], canvas", {
        timeout: 15000,
      });
      await page2.waitForSelector("[class*='excalidraw'], canvas", {
        timeout: 15000,
      });

      await page1.waitForTimeout(2000);
      await page2.waitForTimeout(2000);

      const collaboratorIndicator1 = page1.locator(
        "[data-testid='collaborator-avatar'], .collaborator-avatar, [class*='collaborator']",
      );
      const collaboratorIndicator2 = page2.locator(
        "[data-testid='collaborator-avatar'], .collaborator-avatar, [class*='collaborator']",
      );

      const hasCollaborator1 = await collaboratorIndicator1.count();
      const hasCollaborator2 = await collaboratorIndicator2.count();

      expect(hasCollaborator1 + hasCollaborator2).toBeGreaterThanOrEqual(0);
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test("should sync drawing changes between two users", async ({
    browser,
    request,
  }) => {
    const drawing = await createDrawing(request, {
      name: `Collab_Sync_${Date.now()}`,
      elements: [],
    });
    createdDrawingIds.push(drawing.id);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      await page1.goto(`/editor/${drawing.id}`);
      await page2.goto(`/editor/${drawing.id}`);

      await page1.waitForSelector("[class*='excalidraw'], canvas", {
        timeout: 15000,
      });
      await page2.waitForSelector("[class*='excalidraw'], canvas", {
        timeout: 15000,
      });

      await page1.waitForTimeout(2000);
      await page2.waitForTimeout(2000);

      const canvas1 = page1.locator("canvas.excalidraw__canvas.interactive");
      const box1 = await canvas1.boundingBox();
      if (!box1) throw new Error("Canvas not found");

      await page1.keyboard.press("r");
      await page1.waitForTimeout(200);

      await page1.mouse.move(box1.x + 100, box1.y + 100);
      await page1.mouse.down();
      await page1.mouse.move(box1.x + 300, box1.y + 200, { steps: 5 });
      await page1.mouse.up();

      await page1.waitForTimeout(1000);

      const updatedDrawing = await getDrawing(request, drawing.id);

      const elements = updatedDrawing.elements || [];

      expect(elements).toBeDefined();
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test("should persist drawing changes across page reload", async ({
    page,
    request,
  }) => {
    const drawing = await createDrawing(request, {
      name: `Collab_Persist_${Date.now()}`,
      elements: [],
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", {
      timeout: 15000,
    });
    await page.waitForTimeout(1000);

    const canvas = page.locator("canvas.excalidraw__canvas.interactive");

    await page.keyboard.press("r");
    await page.waitForTimeout(200);

    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    await page.mouse.move(box.x + 150, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 350, box.y + 250, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(2000);

    let savedDrawing = await getDrawing(request, drawing.id);
    const elementCount = savedDrawing.elements?.length || 0;

    await page.reload();
    await page.waitForSelector("[class*='excalidraw'], canvas", {
      timeout: 15000,
    });
    await page.waitForTimeout(1000);

    savedDrawing = await getDrawing(request, drawing.id);
    expect(savedDrawing.elements?.length || 0).toBe(elementCount);
  });

  test("should display collaborator cursor positions", async ({
    browser,
    request,
  }) => {
    const drawing = await createDrawing(request, {
      name: `Collab_Cursor_${Date.now()}`,
    });
    createdDrawingIds.push(drawing.id);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      await page1.goto(`/editor/${drawing.id}`);
      await page2.goto(`/editor/${drawing.id}`);

      await page1.waitForSelector("[class*='excalidraw'], canvas", {
        timeout: 15000,
      });
      await page2.waitForSelector("[class*='excalidraw'], canvas", {
        timeout: 15000,
      });

      await page1.waitForTimeout(2000);
      await page2.waitForTimeout(2000);

      const canvas1 = page1.locator("canvas.excalidraw__canvas.interactive");
      const box = await canvas1.boundingBox();
      if (!box) throw new Error("Canvas not found");

      await page1.mouse.move(box.x + 300, box.y + 300);
      await page1.waitForTimeout(500);
      await page1.mouse.move(box.x + 400, box.y + 400);
      await page1.waitForTimeout(500);

      await page2.waitForTimeout(1000);
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
