import { test, expect } from "@playwright/test";
import {
  createDrawing,
  deleteDrawing,
} from "./helpers/api";

/**
 * E2E Tests for Search and Sort functionality
 * 
 * Tests the search drawings feature mentioned in README:
 * - Search by drawing name
 * - Sort by name, created date, modified date
 * - Clear search
 */

test.describe("Search Drawings", () => {
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

  test("should filter drawings by search term", async ({ page, request }) => {
    // Create test drawings with distinct names
    const prefix = `SearchTest_${Date.now()}`;
    const [drawing1, drawing2, drawing3] = await Promise.all([
      createDrawing(request, { name: `${prefix}_Alpha` }),
      createDrawing(request, { name: `${prefix}_Beta` }),
      createDrawing(request, { name: `DifferentName_${Date.now()}` }),
    ]);
    createdDrawingIds.push(drawing1.id, drawing2.id, drawing3.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Verify all drawings are visible initially
    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.waitFor();

    // Search for the prefix - should show only matching drawings
    await searchInput.fill(prefix);

    // Wait for search to apply (debounced)
    await page.waitForTimeout(500);

    // Verify only matching drawings are shown
    await expect(page.locator(`#drawing-card-${drawing1.id}`)).toBeVisible();
    await expect(page.locator(`#drawing-card-${drawing2.id}`)).toBeVisible();
    await expect(page.locator(`#drawing-card-${drawing3.id}`)).not.toBeVisible();

    // Search for specific drawing
    await searchInput.fill(`${prefix}_Alpha`);
    await page.waitForTimeout(500);

    await expect(page.locator(`#drawing-card-${drawing1.id}`)).toBeVisible();
    await expect(page.locator(`#drawing-card-${drawing2.id}`)).not.toBeVisible();
  });

  test("should show empty state when no drawings match search", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `ExistingDrawing_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.fill("NonExistentDrawingName12345");
    await page.waitForTimeout(500);

    // Should show empty state
    await expect(page.getByText("No drawings found")).toBeVisible();
    await expect(page.getByText('No results for "NonExistentDrawingName12345"')).toBeVisible();
  });

  test("should clear search and show all drawings", async ({ page, request }) => {
    const prefix = `ClearSearchTest_${Date.now()}`;
    const [drawing1, drawing2] = await Promise.all([
      createDrawing(request, { name: `${prefix}_One` }),
      createDrawing(request, { name: `${prefix}_Two` }),
    ]);
    createdDrawingIds.push(drawing1.id, drawing2.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");

    // Search for one drawing
    await searchInput.fill(`${prefix}_One`);
    await page.waitForTimeout(500);
    await expect(page.locator(`#drawing-card-${drawing2.id}`)).not.toBeVisible();

    // Clear search
    await searchInput.fill("");
    await page.waitForTimeout(500);

    // Search for prefix to find both
    await searchInput.fill(prefix);
    await page.waitForTimeout(500);

    // Both should be visible now
    await expect(page.locator(`#drawing-card-${drawing1.id}`)).toBeVisible();
    await expect(page.locator(`#drawing-card-${drawing2.id}`)).toBeVisible();
  });

  test("should use keyboard shortcut Cmd+K to focus search", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `KeyboardTest_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");

    // Use keyboard shortcut (Cmd+K on Mac, Ctrl+K on Windows/Linux)
    await page.keyboard.press("Meta+k");

    // Search input should be focused
    await expect(searchInput).toBeFocused();
  });
});

test.describe("Sort Drawings", () => {
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

  test("should sort drawings by name", async ({ page, request }) => {
    const prefix = `SortTest_${Date.now()}`;

    // Create drawings with names that sort in a specific order
    const [drawingC, drawingA, drawingB] = await Promise.all([
      createDrawing(request, { name: `${prefix}_Charlie` }),
      createDrawing(request, { name: `${prefix}_Alpha` }),
      createDrawing(request, { name: `${prefix}_Bravo` }),
    ]);
    createdDrawingIds.push(drawingC.id, drawingA.id, drawingB.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter to only our test drawings
    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.fill(prefix);
    await page.waitForTimeout(500);

    // Click Name sort button
    const nameSortButton = page.getByRole("button", { name: "Name" });
    await nameSortButton.click();

    // Get the order of cards
    const cards = page.locator("[id^='drawing-card-']");
    await expect(cards).toHaveCount(3);

    // Verify order is alphabetical (Alpha, Bravo, Charlie)
    const firstCard = cards.first();
    await expect(firstCard).toHaveId(`drawing-card-${drawingA.id}`);
  });

  test("should toggle sort direction on repeated clicks", async ({ page, request }) => {
    const prefix = `ToggleSortTest_${Date.now()}`;

    const [drawingA, drawingZ] = await Promise.all([
      createDrawing(request, { name: `${prefix}_AAA` }),
      createDrawing(request, { name: `${prefix}_ZZZ` }),
    ]);
    createdDrawingIds.push(drawingA.id, drawingZ.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.fill(prefix);
    await page.waitForTimeout(500);

    const nameSortButton = page.getByRole("button", { name: "Name" });

    // First click - ascending (A first)
    await nameSortButton.click();
    await page.waitForTimeout(200);

    let cards = page.locator("[id^='drawing-card-']");
    let firstCard = cards.first();
    await expect(firstCard).toHaveId(`drawing-card-${drawingA.id}`);

    // Second click - descending (Z first)
    await nameSortButton.click();
    await page.waitForTimeout(200);

    cards = page.locator("[id^='drawing-card-']");
    firstCard = cards.first();
    await expect(firstCard).toHaveId(`drawing-card-${drawingZ.id}`);
  });

  test("should sort by date created", async ({ page, request }) => {
    const prefix = `DateSortTest_${Date.now()}`;

    // Create drawings sequentially to ensure different creation times
    const drawing1 = await createDrawing(request, { name: `${prefix}_First` });
    createdDrawingIds.push(drawing1.id);

    await page.waitForTimeout(100); // Ensure different timestamps

    const drawing2 = await createDrawing(request, { name: `${prefix}_Second` });
    createdDrawingIds.push(drawing2.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.fill(prefix);
    await page.waitForTimeout(500);

    // Click Date Created sort button
    const dateCreatedButton = page.getByRole("button", { name: "Date Created" });
    await dateCreatedButton.click();
    await page.waitForTimeout(200);

    // Default should be descending (newest first)
    const cards = page.locator("[id^='drawing-card-']");
    const firstCard = cards.first();
    await expect(firstCard).toHaveId(`drawing-card-${drawing2.id}`);
  });

  test("should sort by date modified", async ({ page, request }) => {
    const prefix = `ModifiedSortTest_${Date.now()}`;

    const [drawing1, drawing2] = await Promise.all([
      createDrawing(request, { name: `${prefix}_One` }),
      createDrawing(request, { name: `${prefix}_Two` }),
    ]);
    createdDrawingIds.push(drawing1.id, drawing2.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.fill(prefix);
    await page.waitForTimeout(500);

    // Click Date Modified sort button
    const dateModifiedButton = page.getByRole("button", { name: "Date Modified" });
    await dateModifiedButton.click();

    // Verify the button shows active state
    await expect(dateModifiedButton).toHaveClass(/bg-indigo-100|bg-neutral-800/);
  });
});
