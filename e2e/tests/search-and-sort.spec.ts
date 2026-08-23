import { test, expect, type Page } from "@playwright/test";
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
      }
    }
    createdDrawingIds = [];
  });

  test("should filter drawings by search term", async ({ page, request }) => {
    const prefix = `SearchTest_${Date.now()}`;
    const [drawing1, drawing2, drawing3] = await Promise.all([
      createDrawing(request, { name: `${prefix}_Alpha` }),
      createDrawing(request, { name: `${prefix}_Beta` }),
      createDrawing(request, { name: `DifferentName_${Date.now()}` }),
    ]);
    createdDrawingIds.push(drawing1.id, drawing2.id, drawing3.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.waitFor();

    await searchInput.fill(prefix);

    await page.waitForTimeout(500);

    await expect(page.locator(`#drawing-card-${drawing1.id}`)).toBeVisible();
    await expect(page.locator(`#drawing-card-${drawing2.id}`)).toBeVisible();
    await expect(page.locator(`#drawing-card-${drawing3.id}`)).not.toBeVisible();

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

    await searchInput.fill(`${prefix}_One`);
    await page.waitForTimeout(500);
    await expect(page.locator(`#drawing-card-${drawing2.id}`)).not.toBeVisible();

    await searchInput.fill("");
    await page.waitForTimeout(500);

    await searchInput.fill(prefix);
    await page.waitForTimeout(500);

    await expect(page.locator(`#drawing-card-${drawing1.id}`)).toBeVisible();
    await expect(page.locator(`#drawing-card-${drawing2.id}`)).toBeVisible();
  });

  test("should use keyboard shortcut Cmd+K to focus search", async ({ page, request }) => {
    const drawing = await createDrawing(request, { name: `KeyboardTest_${Date.now()}` });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");

    await page.keyboard.press("ControlOrMeta+k");

    await expect(searchInput).toBeFocused();
  });
});

test.describe("Sort Drawings", () => {
  let createdDrawingIds: string[] = [];

  const getSortFieldButton = (page: Page) =>
    page.getByRole("button", { name: "Sort drawings" });

  const chooseSortField = async (
    page: Page,
    label: "Name" | "Date Created" | "Date Modified"
  ) => {
    await getSortFieldButton(page).click();
    await page.getByRole("option", { name: label }).click();
    await expect(getSortFieldButton(page)).toContainText(label);
  };

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
      }
    }
    createdDrawingIds = [];
  });

  test("should sort drawings by name", async ({ page, request }) => {
    const prefix = `SortTest_${Date.now()}`;

    const [drawingC, drawingA, drawingB] = await Promise.all([
      createDrawing(request, { name: `${prefix}_Charlie` }),
      createDrawing(request, { name: `${prefix}_Alpha` }),
      createDrawing(request, { name: `${prefix}_Bravo` }),
    ]);
    createdDrawingIds.push(drawingC.id, drawingA.id, drawingB.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.fill(prefix);
    await page.waitForTimeout(500);

    await chooseSortField(page, "Name");

    const cards = page.locator("[id^='drawing-card-']");
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toHaveId(`drawing-card-${drawingA.id}`);
    await expect(cards.nth(1)).toHaveId(`drawing-card-${drawingB.id}`);
    await expect(cards.nth(2)).toHaveId(`drawing-card-${drawingC.id}`);
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

    await chooseSortField(page, "Name");

    let cards = page.locator("[id^='drawing-card-']");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveId(`drawing-card-${drawingA.id}`);

    const directionToggle = page.getByTitle(/Sort (Ascending|Descending)/);
    await directionToggle.click();

    cards = page.locator("[id^='drawing-card-']");
    await expect(cards.first()).toHaveId(`drawing-card-${drawingZ.id}`);
  });

  test("should sort by date created", async ({ page, request }) => {
    const prefix = `DateSortTest_${Date.now()}`;

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

    await chooseSortField(page, "Date Created");

    const cards = page.locator("[id^='drawing-card-']");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveId(`drawing-card-${drawing2.id}`);
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

    await chooseSortField(page, "Date Modified");
    await expect(getSortFieldButton(page)).toHaveText(/Date Modified/);
    await expect(page.getByTitle(/Sort (Ascending|Descending)/)).toBeVisible();
  });
});
