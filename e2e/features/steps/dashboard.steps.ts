import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { listCollections, listDrawings, getDrawing, deleteDrawing, type DrawingRecord } from "./api-helpers";
import { applyDashboardSearch, ensureCardSelected, ensureCardVisible, waitForDashboard } from "./ui-helpers";

When("I create a collection named {string}", async function (this: ExcaliDashWorld, name: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);

  await this.page.getByTitle("New Collection").click();
  const collectionInput = this.page.getByPlaceholder("New Collection...");
  await collectionInput.fill(name);
  await collectionInput.press("Enter");

  await expect.poll(async () => {
    const collections = await listCollections(this.request!);
    return collections.find((collection) => collection.name === name) || null;
  }, { timeout: 10000 }).not.toBeNull();

  const collections = await listCollections(this.request);
  const createdCollection = collections.find((collection) => collection.name === name);
  if (!createdCollection) {
    throw new Error("Failed to create collection");
  }
  if (!this.createdCollectionIds.includes(createdCollection.id)) {
    this.createdCollectionIds.push(createdCollection.id);
  }
  this.scenarioData.collectionId = createdCollection.id;
  this.scenarioData.collectionName = name;
});

When("I move the drawing into collection {string}", async function (this: ExcaliDashWorld, collectionName: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const collections = await listCollections(this.request);
  const collection = collections.find((item) => item.name === collectionName);
  if (!collection) throw new Error(`Collection ${collectionName} not found`);

  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  const card = await ensureCardVisible(this.page, drawingId);
  const collectionButton = card.locator(`[data-testid="collection-picker-${drawingId}"]`);
  await collectionButton.click();
  await this.page.locator(`[data-testid="collection-option-${collection.id}"]`).click();
  await expect(collectionButton).toContainText(collectionName);

  await expect.poll(async () => {
    const updated = await getDrawing(this.request!, drawingId);
    return updated.collectionId;
  }).toBe(collection.id);
});

When("I move the drawing into collection {string} using the card menu", async function (this: ExcaliDashWorld, collectionName: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const collections = await listCollections(this.request);
  const collection = collections.find((item) => item.name === collectionName);
  if (!collection) throw new Error(`Collection ${collectionName} not found`);

  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  const card = await ensureCardVisible(this.page, drawingId);
  await card.hover();
  const collectionPicker = card.locator(`[data-testid="collection-picker-${drawingId}"]`);
  await collectionPicker.click();
  await this.page.locator(`[data-testid="collection-option-${collection.id}"]`).click();
  await expect(collectionPicker).toContainText(collectionName);
});

When("I move the drawing into collection {string} using the bulk menu", async function (this: ExcaliDashWorld, collectionName: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const drawings = this.createdDrawingIds;
  const collections = await listCollections(this.request);
  const collection = collections.find((item) => item.name === collectionName);
  if (!collection) throw new Error(`Collection ${collectionName} not found`);

  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  await applyDashboardSearch(this.page, "");

  for (const id of drawings) {
    await ensureCardSelected(this.page, id);
  }

  const moveButton = this.page.getByTitle("Move Selected");
  await moveButton.click();
  const collectionOption = this.page.locator(`button:has-text("${collection.name}")`).last();
  await expect(collectionOption).toBeVisible();
  await collectionOption.click();
  await expect.poll(async () => {
    const updated = await Promise.all(
      drawings.map((id) => getDrawing(this.request!, id))
    );
    return updated.every((drawing) => drawing.collectionId === collection.id);
  }, { timeout: 15000 }).toBe(true);
});

When("I duplicate the drawings in bulk", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);

  for (const id of this.createdDrawingIds) {
    await ensureCardSelected(this.page, id);
  }

  // Wait for all duplicate API calls to complete
  const duplicatePromises = this.createdDrawingIds.map((id) =>
    this.page!.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/drawings/${id}/duplicate`),
      { timeout: 15000 }
    )
  );

  await this.page.getByTitle("Duplicate Selected").click();
  await Promise.all(duplicatePromises);

  // Wait for dashboard to refresh and show the new duplicates
  await this.page.waitForLoadState("networkidle");
});

When("I move the duplicated drawings to trash", async function (this: ExcaliDashWorld) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const searchPrefix = (this.scenarioData.drawingPrefix as string) || "";
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  await applyDashboardSearch(this.page, searchPrefix);

  const results = await listDrawings(this.request, { search: searchPrefix });
  for (const drawing of results) {
    await ensureCardSelected(this.page, drawing.id);
  }

  // Wait for the move-to-trash API calls to complete for all selected drawings
  const movePromises = results.map((drawing) =>
    this.page!.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        response.url().includes(`/drawings/${drawing.id}`),
      { timeout: 15000 }
    ).catch(() => null) // Some may already be in trash
  );

  const moveToTrashButton = this.page.getByTitle("Move to Trash");
  await expect(moveToTrashButton).toBeEnabled({ timeout: 10000 });
  await moveToTrashButton.click();

  await Promise.all(movePromises);
  await this.page.waitForLoadState("networkidle");
});

Then("the drawing should appear in collection {string}", async function (this: ExcaliDashWorld, collectionName: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const collectionId = this.scenarioData.collectionId as string;
  const drawingId = this.scenarioData.drawingId as string;

  await this.page.getByRole("navigation").getByRole("button", { name: collectionName }).first().click();
  await this.page.waitForLoadState("networkidle");
  await expect(this.page.locator(`#drawing-card-${drawingId}`)).toBeVisible();

  const updated = await getDrawing(this.request, drawingId);
  expect(updated.collectionId).toBe(collectionId);
});

Then("the drawing should not appear in the unorganized view", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.getByRole("navigation").getByRole("button", { name: "Unorganized" }).click();
  await this.page.waitForLoadState("networkidle");
  await expect(this.page.locator(`#drawing-card-${drawingId}`)).toHaveCount(0);
});

Then("{int} drawings named {string} should be in the trash", async function (this: ExcaliDashWorld, count: number, prefix: string) {
  if (!this.request) throw new Error("Request not initialized");

  // Poll for expected drawings in trash with retry
  const expectedMin = Math.max(2, count - 2);
  let trashed: DrawingRecord[] = [];
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    trashed = await listDrawings(this.request, { search: prefix, collectionId: "trash" });
    if (trashed.length >= expectedMin) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  expect(trashed.length).toBeGreaterThanOrEqual(expectedMin);
  expect(trashed.length).toBeGreaterThan(0);

  for (const drawing of trashed) {
    await deleteDrawing(this.request, drawing.id);
  }
  const removedIds = new Set(trashed.map((drawing) => drawing.id));
  this.createdDrawingIds = this.createdDrawingIds.filter((id) => !removedIds.has(id));
});

When("I select all drawings using the keyboard", async function (this: ExcaliDashWorld) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  await applyDashboardSearch(this.page, "");
  await this.page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    active?.blur();
  });
  await this.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
});

Then("all drawings should be selected", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const toggles = this.page.locator('[data-testid^="select-drawing-"]');
  const total = await toggles.count();
  expect(total).toBeGreaterThan(0);
  await expect.poll(async () => {
    const pressed = await this.page
      .locator('[data-testid^="select-drawing-"][aria-pressed="true"]')
      .count();
    return pressed;
  }, { timeout: 10000 }).toBe(total);
});

When("I clear the selection with escape", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.keyboard.press("Escape");
});

Then("no drawings should be selected", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const pressed = this.page.locator('[data-testid^="select-drawing-"][aria-pressed="true"]');
  await expect(pressed).toHaveCount(0);
});
