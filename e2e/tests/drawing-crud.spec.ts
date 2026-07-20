import { test, expect } from "@playwright/test";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getDrawing,
  listDrawings,
} from "./helpers/api";

/**
 * E2E Tests for Drawing Creation and Editing
 * 
 * Tests the persistent storage feature mentioned in README:
 * - Create new drawings
 * - Edit drawing names
 * - Delete drawings
 * - Drawing canvas interactions
 * - Auto-save functionality
 */

const revealEditorHeader = async (page: import("@playwright/test").Page) => {
  await page.mouse.move(24, 2);
  await page.waitForTimeout(150);
};

test.describe("Drawing Creation", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdDrawingIds = [];
  });

  test("should create a new drawing via UI", async ({ page, request }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const newDrawingButton = page.getByRole("button", { name: /New Drawing/i });
    await newDrawingButton.click();
    await page.getByTestId("engine-card-excalidraw").click();

    await page.waitForURL(/\/editor\//);

    const url = page.url();
    const match = url.match(/\/editor\/([^/]+)/);
    expect(match).toBeTruthy();
    const drawingId = match![1];
    createdDrawingIds.push(drawingId);

    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

    const drawing = await getDrawing(request, drawingId);
    expect(drawing).toBeDefined();
    expect(drawing.name).toBe("Untitled Drawing");
  });

  test("should open existing drawing in editor", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `Open_Test_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("Search drawings...").fill(drawing.name);
    await page.waitForTimeout(500);

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.click();

    await page.waitForURL(`/editor/${drawing.id}`);

    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  });

  test("should display drawing name in editor header", async ({ page, request }) => {
    const drawingName = `Header_Test_${Date.now()}`;
    const drawing = await createDrawing(request, { name: drawingName });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

    await expect(page.getByText(drawingName)).toBeVisible();
  });

  test("should rename drawing via editor header", async ({ page, request }) => {
    const originalName = `Rename_Original_${Date.now()}`;
    const newName = `Rename_Updated_${Date.now()}`;

    const drawing = await createDrawing(request, { name: originalName });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

    await revealEditorHeader(page);

    const nameElement = page.getByText(originalName);
    await expect(nameElement).toBeInViewport();
    await nameElement.dblclick();

    await page.waitForTimeout(300);

    const nameInput = page.locator("input").filter({ hasText: "" }).first();
    await nameInput.clear();
    await nameInput.fill(newName);
    await nameInput.press("Enter");

    await page.waitForTimeout(1000);

    const updatedDrawing = await getDrawing(request, drawing.id);
    expect(updatedDrawing.name).toBe(newName);
  });

  test("should navigate back to dashboard from editor", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `BackNav_Test_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

    await revealEditorHeader(page);

    const backButton = page.locator("header button").first();
    await expect(backButton).toBeInViewport();
    await backButton.click();

    await page.waitForURL("/");
    await expect(page.getByPlaceholder("Search drawings...")).toBeVisible();
  });
});

test.describe("Drawing Editing", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdDrawingIds = [];
  });

  test("should draw a rectangle on canvas", async ({ page, request }) => {
    const drawing = await createDrawing(request, {
      name: `Draw_Rect_${Date.now()}`,
      elements: [],
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
    await page.waitForTimeout(1500);

    const canvas = page.locator("canvas.excalidraw__canvas.interactive");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    console.log(`Canvas bounding box: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);

    const rectangleLabel = page.locator('label:has([data-testid="toolbar-rectangle"])');
    await rectangleLabel.click();
    await page.waitForTimeout(500);

    const isRectangleSelectedBefore = await page.locator('[data-testid="toolbar-rectangle"]').isChecked();
    console.log("Rectangle tool selected before drawing:", isRectangleSelectedBefore);

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const startX = centerX - 100;
    const startY = centerY - 75;
    const endX = centerX + 100;
    const endY = centerY + 75;

    console.log(`Drawing from (${startX}, ${startY}) to (${endX}, ${endY})`);

    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(200);

    await page.mouse.move(startX, startY);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(endX, endY, { steps: 20 });
    await page.waitForTimeout(100);
    await page.mouse.up();

    await page.screenshot({ path: 'test-results/after-drawing.png' });

    const undoButton = page.locator('button[aria-label="Undo"]');
    const isUndoDisabled = await undoButton.getAttribute('disabled');
    console.log("Undo button disabled:", isUndoDisabled);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await page.waitForTimeout(2000);

    await expect.poll(async () => {
      const savedDrawing = await getDrawing(request, drawing.id);
      return savedDrawing.elements?.length || 0;
    }, { timeout: 15000 }).toBeGreaterThan(0);
  });

  test("should draw text on canvas", async ({ page, request }) => {
    const drawing = await createDrawing(request, {
      name: `Draw_Text_${Date.now()}`,
      elements: [],
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
    await page.waitForTimeout(1000);

    const canvas = page.locator("canvas.excalidraw__canvas.interactive");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    await page.mouse.click(box.x + 100, box.y + 100);
    await page.waitForTimeout(100);

    await page.keyboard.press("t");
    await page.waitForTimeout(200);

    await page.mouse.click(box.x + 300, box.y + 300);
    await page.waitForTimeout(200);

    await page.keyboard.type("Hello E2E Test");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await page.waitForTimeout(3000);

    await expect.poll(async () => {
      const savedDrawing = await getDrawing(request, drawing.id);
      return savedDrawing.elements?.length || 0;
    }, { timeout: 10000 }).toBeGreaterThan(0);
  });

  test("should use undo/redo functionality", async ({ page, request }) => {
    const drawing = await createDrawing(request, {
      name: `Undo_Redo_${Date.now()}`,
      elements: [],
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
    await page.waitForTimeout(1000);

    const canvas = page.locator("canvas.excalidraw__canvas.interactive");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    await page.keyboard.press("r");
    await page.waitForTimeout(200);

    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 300, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(500);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(500);

    await page.keyboard.press("Meta+Shift+z");
    await page.waitForTimeout(500);

  });
});

test.describe("Drawing Deletion", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdDrawingIds = [];
  });

  test("should delete drawing via card menu", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `Delete_Card_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("Search drawings...").fill(drawing.name);
    await page.waitForTimeout(500);

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.hover();

    const selectToggle = card.locator(`[data-testid="select-drawing-${drawing.id}"]`);
    await selectToggle.click();

    await page.getByTitle("Move to Trash").click();

    await expect(card).not.toBeVisible();

    await page.getByRole("button", { name: /^Trash$/ }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(`#drawing-card-${drawing.id}`)).toBeVisible();
  });

  test("should permanently delete drawing from trash", async ({ page, request }) => {
    const drawing = await createDrawing(request, {
      name: `Perm_Delete_${Date.now()}`,
      collectionId: "trash"
    });
    createdDrawingIds.push(drawing.id);

    await page.goto("/?view=trash");
    await page.getByRole("button", { name: /^Trash$/ }).click();
    await page.waitForLoadState("networkidle");

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.hover();

    const selectToggle = card.locator(`[data-testid="select-drawing-${drawing.id}"]`);
    await selectToggle.click();

    await page.getByTitle("Delete Permanently").click();

    await page.getByRole("button", { name: /Delete \d+ Drawings?/i }).click();

    await expect(card).not.toBeVisible();

    const response = await request.get(`${API_URL}/drawings/${drawing.id}`);
    expect(response.status()).toBe(404);

    createdDrawingIds = createdDrawingIds.filter(id => id !== drawing.id);
  });

  test("should duplicate drawing", async ({ page, request }) => {
    const baseName = `Duplicate_Test_${Date.now()}`;
    const drawing = await createDrawing(request, { name: baseName });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("Search drawings...").fill(baseName);
    await page.waitForTimeout(500);

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.hover();

    const selectToggle = card.locator(`[data-testid="select-drawing-${drawing.id}"]`);
    await selectToggle.click();

    await page.getByTitle("Duplicate Selected").click();

    await expect.poll(async () => {
      const allDrawings = await listDrawings(request, { search: baseName });
      return allDrawings.length;
    }, { timeout: 10000 }).toBe(2);

    await page.getByPlaceholder("Search drawings...").fill(baseName);
    await page.waitForTimeout(700);
    await expect(page.locator("[id^='drawing-card-']")).toHaveCount(2);

    const allDrawings = await listDrawings(request, { search: baseName });
    for (const d of allDrawings) {
      if (!createdDrawingIds.includes(d.id)) {
        createdDrawingIds.push(d.id);
      }
    }
  });
});
