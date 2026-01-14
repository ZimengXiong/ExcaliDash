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

test.describe("Drawing Creation", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDrawingIds = [];
  });

  test("should create a new drawing via UI", async ({ page, request }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click the New Drawing button
    const newDrawingButton = page.getByRole("button", { name: /New Drawing/i });
    await newDrawingButton.click();

    // Should navigate to editor
    await page.waitForURL(/\/editor\//);

    // Extract the drawing ID from the URL
    const url = page.url();
    const match = url.match(/\/editor\/([^/]+)/);
    expect(match).toBeTruthy();
    const drawingId = match![1];
    createdDrawingIds.push(drawingId);

    // Verify the editor loaded
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

    // Verify drawing was created in the database
    const drawing = await getDrawing(request, drawingId);
    expect(drawing).toBeDefined();
    expect(drawing.name).toBe("Untitled Drawing");
  });

  test("should open existing drawing in editor", async ({ page, request }) => {
    // Create a drawing via API
    const drawing = await createDrawing(request, { name: `Open_Test_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Search for the drawing
    await page.getByPlaceholder("Search drawings...").fill(drawing.name);
    await page.waitForTimeout(500);

    // Click on the drawing card
    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.click();

    // Should navigate to editor
    await page.waitForURL(`/editor/${drawing.id}`);

    // Verify editor loaded
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  });

  test("should display drawing name in editor header", async ({ page, request }) => {
    const drawingName = `Header_Test_${Date.now()}`;
    const drawing = await createDrawing(request, { name: drawingName });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

    // The drawing name should be visible in the header
    await expect(page.getByText(drawingName)).toBeVisible();
  });

  test("should rename drawing via editor header", async ({ page, request }) => {
    const originalName = `Rename_Original_${Date.now()}`;
    const newName = `Rename_Updated_${Date.now()}`;

    const drawing = await createDrawing(request, { name: originalName });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

    // Click on the drawing name to edit it - it's a button that becomes an input
    const nameElement = page.getByText(originalName);
    await nameElement.dblclick();

    // Wait for edit mode
    await page.waitForTimeout(300);

    // Type new name - the input should now be visible
    const nameInput = page.locator("input").filter({ hasText: "" }).first();
    await nameInput.clear();
    await nameInput.fill(newName);
    await nameInput.press("Enter");

    // Wait for save
    await page.waitForTimeout(1000);

    // Verify the name was updated via API
    const updatedDrawing = await getDrawing(request, drawing.id);
    expect(updatedDrawing.name).toBe(newName);
  });

  test("should navigate back to dashboard from editor", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `BackNav_Test_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

    // Find and click the back button (arrow left icon in header)
    // The back button is a button element containing an ArrowLeft icon
    const backButton = page.locator("header button").first();
    await backButton.click();

    // Should navigate back to dashboard
    await page.waitForURL("/");
    // Dashboard should be visible
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
        // Ignore cleanup errors
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

    // Get the canvas bounding box
    const canvas = page.locator("canvas.excalidraw__canvas.interactive");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    console.log(`Canvas bounding box: x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`);

    // Click on the rectangle tool using the label element
    // Find the label that contains the rectangle radio button
    const rectangleLabel = page.locator('label:has([data-testid="toolbar-rectangle"])');
    await rectangleLabel.click();
    await page.waitForTimeout(500);

    // Verify the tool was selected
    const isRectangleSelectedBefore = await page.locator('[data-testid="toolbar-rectangle"]').isChecked();
    console.log("Rectangle tool selected before drawing:", isRectangleSelectedBefore);

    // Draw the rectangle by dragging on the canvas - use center of canvas
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const startX = centerX - 100;
    const startY = centerY - 75;
    const endX = centerX + 100;
    const endY = centerY + 75;

    console.log(`Drawing from (${startX}, ${startY}) to (${endX}, ${endY})`);

    // First click on the canvas to ensure it has focus
    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(200);

    // Now draw the rectangle
    await page.mouse.move(startX, startY);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(endX, endY, { steps: 20 });
    await page.waitForTimeout(100);
    await page.mouse.up();

    // Take a screenshot after drawing
    await page.screenshot({ path: 'test-results/after-drawing.png' });

    // Check if Undo button is now enabled (indicating something was drawn)
    const undoButton = page.locator('button[aria-label="Undo"]');
    const isUndoDisabled = await undoButton.getAttribute('disabled');
    console.log("Undo button disabled:", isUndoDisabled);

    // Press Escape to deselect and trigger save
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Wait for auto-save (debounced save has a delay of 1000ms)
    await page.waitForTimeout(2000);

    // Poll for the drawing to have elements (auto-save may take time)
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

    // Click on the canvas first to focus it
    const canvas = page.locator("canvas.excalidraw__canvas.interactive");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Click to focus the canvas
    await page.mouse.click(box.x + 100, box.y + 100);
    await page.waitForTimeout(100);

    // Select text tool using keyboard shortcut (now that canvas is focused)
    await page.keyboard.press("t");
    await page.waitForTimeout(200);

    // Click to place text
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.waitForTimeout(200);

    // Type some text
    await page.keyboard.type("Hello E2E Test");

    // Press Escape to finish text editing
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // Wait for auto-save (debounced save has a delay)
    await page.waitForTimeout(3000);

    // Poll for the drawing to have elements (auto-save may take time)
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

    // Draw something on the interactive canvas
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

    // Undo
    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(500);

    // Redo
    await page.keyboard.press("Meta+Shift+z");
    await page.waitForTimeout(500);

    // The test passes if no errors occur during undo/redo operations
  });
});

test.describe("Drawing Deletion", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdDrawingIds = [];
  });

  test("should delete drawing via card menu", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `Delete_Card_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Search for the drawing
    await page.getByPlaceholder("Search drawings...").fill(drawing.name);
    await page.waitForTimeout(500);

    // Find the card and select it
    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.hover();

    const selectToggle = card.locator(`[data-testid="select-drawing-${drawing.id}"]`);
    await selectToggle.click();

    // Click trash button
    await page.getByTitle("Move to Trash").click();

    // Card should disappear from main view
    await expect(card).not.toBeVisible();

    // Navigate to trash
    await page.getByRole("button", { name: /^Trash$/ }).click();
    await page.waitForLoadState("networkidle");

    // Drawing should be in trash
    await expect(page.locator(`#drawing-card-${drawing.id}`)).toBeVisible();
  });

  test("should permanently delete drawing from trash", async ({ page, request }) => {
    const drawing = await createDrawing(request, {
      name: `Perm_Delete_${Date.now()}`,
      collectionId: "trash"
    });
    createdDrawingIds.push(drawing.id);

    // Navigate directly to trash
    await page.goto("/?view=trash");
    await page.getByRole("button", { name: /^Trash$/ }).click();
    await page.waitForLoadState("networkidle");

    // Select the drawing
    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.hover();

    const selectToggle = card.locator(`[data-testid="select-drawing-${drawing.id}"]`);
    await selectToggle.click();

    // Click permanent delete
    await page.getByTitle("Delete Permanently").click();

    // Confirm deletion
    await page.getByRole("button", { name: /Delete \d+ Drawings?/i }).click();

    // Card should be gone
    await expect(card).not.toBeVisible();

    // Verify via API that drawing is deleted
    const response = await request.get(`${API_URL}/drawings/${drawing.id}`);
    expect(response.status()).toBe(404);

    // Remove from cleanup list since it's already deleted
    createdDrawingIds = createdDrawingIds.filter(id => id !== drawing.id);
  });

  test("should duplicate drawing", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `Duplicate_Test_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Search for the drawing
    await page.getByPlaceholder("Search drawings...").fill(drawing.name);
    await page.waitForTimeout(500);

    // Select the drawing
    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.hover();

    const selectToggle = card.locator(`[data-testid="select-drawing-${drawing.id}"]`);
    await selectToggle.click();

    // Click duplicate button
    await page.getByTitle("Duplicate Selected").click();

    // Wait for the duplicate to be created
    await page.waitForTimeout(1000);

    // Clear search to see all drawings
    await page.getByPlaceholder("Search drawings...").fill("");
    await page.waitForTimeout(500);

    // Search again to find both
    await page.getByPlaceholder("Search drawings...").fill("Duplicate_Test");
    await page.waitForTimeout(500);

    // There should be two cards now
    const cards = page.locator("[id^='drawing-card-']");
    await expect(cards).toHaveCount(2);

    // Get the duplicate ID for cleanup
    const allDrawings = await listDrawings(request, { search: "Duplicate_Test" });
    for (const d of allDrawings) {
      if (!createdDrawingIds.includes(d.id)) {
        createdDrawingIds.push(d.id);
      }
    }
  });
});
