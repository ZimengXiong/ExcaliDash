import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getDrawing,
  listDrawings,
  listCollections,
  deleteCollection,
} from "./helpers/api";

const searchPlaceholder = "Search drawings...";

async function applyDashboardSearch(page: Page, term: string) {
  const searchInput = page.getByPlaceholder(searchPlaceholder);
  await searchInput.waitFor();
  await searchInput.fill("");
  await searchInput.fill(term);
}

async function ensureCardVisible(page: Page, drawingId: string): Promise<Locator> {
  const card = page.locator(`#drawing-card-${drawingId}`);
  await card.waitFor({ state: "attached" });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  return card;
}

async function ensureCardSelected(page: Page, drawingId: string) {
  const card = await ensureCardVisible(page, drawingId);
  const toggle = card.locator(`[data-testid="select-drawing-${drawingId}"]`);
  const pressed = await toggle.getAttribute("aria-pressed");
  if (pressed !== "true") {
    await card.hover();
    await toggle.click();
  }
}

test.describe("Dashboard Workflows", () => {
  let createdDrawingIds: string[] = [];
  let createdCollectionIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
        // Ignore cleanup failures to keep tests resilient
      }
    }
    createdDrawingIds = [];

    for (const id of createdCollectionIds) {
      try {
        await deleteCollection(request, id);
      } catch {
        // Ignore cleanup failures to keep tests resilient
      }
    }
    createdCollectionIds = [];
  });

  test("should move drawing to trash and permanently delete it via bulk controls", async ({ page, request }) => {
    const drawingName = `Trash Workflow ${Date.now()}`;
    const createdDrawing = await createDrawing(request, { name: drawingName });
    createdDrawingIds.push(createdDrawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await applyDashboardSearch(page, drawingName);

    const cardLocator = await ensureCardVisible(page, createdDrawing.id);

    await ensureCardSelected(page, createdDrawing.id);
    await page.getByTitle("Move to Trash").click();
    await expect(cardLocator).toHaveCount(0);

    await page.getByRole("button", { name: /^Trash$/ }).click();
    const trashCard = await ensureCardVisible(page, createdDrawing.id);

    await ensureCardSelected(page, createdDrawing.id);
    await page.getByTitle("Delete Permanently").click();
    await page.getByRole("button", { name: /Delete \d+ Drawings/ }).click();

    await expect(trashCard).toHaveCount(0);

    const response = await request.get(`${API_URL}/drawings/${createdDrawing.id}`);
    expect(response.status()).toBe(404);
    createdDrawingIds = createdDrawingIds.filter((id) => id !== createdDrawing.id);
  });

  test("should create a collection via UI and move drawings using card controls", async ({ page, request }) => {
    const drawingName = `Collection Flow ${Date.now()}`;
    const createdDrawing = await createDrawing(request, { name: drawingName });
    createdDrawingIds.push(createdDrawing.id);

    const collectionName = `Team ${Date.now()}`;
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await applyDashboardSearch(page, drawingName);

    await page.getByTitle("New Collection").click();
    const collectionInput = page.getByPlaceholder("New Collection...");
    await collectionInput.fill(collectionName);
    await collectionInput.press("Enter");

    await expect(page.getByRole("button", { name: collectionName })).toBeVisible();

    const collections = await listCollections(request);
    const createdCollection = collections.find((collection) => collection.name === collectionName);
    expect(createdCollection).toBeDefined();
    if (!createdCollection) {
      throw new Error("Failed to locate created collection");
    }
    createdCollectionIds.push(createdCollection.id);

    const cardLocator = await ensureCardVisible(page, createdDrawing.id);

    const collectionButton = cardLocator.locator(`[data-testid="collection-picker-${createdDrawing.id}"]`);
    await collectionButton.click();
    await page.locator(`[data-testid="collection-option-${createdCollection.id}"]`).click();
    await expect(collectionButton).toContainText(collectionName);

    await expect.poll(async () => {
      const updated = await getDrawing(request, createdDrawing.id);
      return updated.collectionId;
    }).toBe(createdCollection.id);

    await page.getByRole("navigation").getByRole("button", { name: collectionName }).click();
    await expect(cardLocator).toBeVisible();

    await page.getByRole("navigation").getByRole("button", { name: "Unorganized" }).click();
    await expect(cardLocator).toHaveCount(0);
  });

  test("should duplicate multiple drawings and move them to trash via bulk toolbar", async ({ page, request }) => {
    const prefix = `Bulk Flow ${Date.now()}`;
    const [first, second] = await Promise.all([
      createDrawing(request, { name: `${prefix} A` }),
      createDrawing(request, { name: `${prefix} B` }),
    ]);
    createdDrawingIds.push(first.id, second.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await applyDashboardSearch(page, prefix);

    await ensureCardSelected(page, first.id);
    await ensureCardSelected(page, second.id);

    await page.getByTitle("Duplicate Selected").click();

    await expect.poll(async () => {
      const results = await listDrawings(request, { search: prefix });
      return results.length;
    }).toBe(4);

    const allPrefixDrawings = await listDrawings(request, { search: prefix });
    for (const drawing of allPrefixDrawings) {
      await ensureCardSelected(page, drawing.id);
    }
    await page.getByTitle("Move to Trash").click();

    await expect.poll(async () => {
      const trashed = await listDrawings(request, { search: prefix, collectionId: "trash" });
      return trashed.length;
    }).toBe(4);

    const trashDrawings = await listDrawings(request, { search: prefix, collectionId: "trash" });
    for (const drawing of trashDrawings) {
      await deleteDrawing(request, drawing.id);
    }
    const removedIds = new Set(trashDrawings.map((drawing) => drawing.id));
    createdDrawingIds = createdDrawingIds.filter((id) => !removedIds.has(id));

    await expect.poll(async () => {
      const remaining = await listDrawings(request, { search: prefix });
      return remaining.length;
    }).toBe(0);
  });
});
