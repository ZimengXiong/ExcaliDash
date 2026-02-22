import { Given, When, Then } from "@cucumber/cucumber";
import { expect, type Page } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import {
  createDrawing,
  deleteDrawing,
  listDrawings,
  getDrawing,
} from "./api-helpers";
import { applyDashboardSearch, ensureCardSelected, waitForDashboard, waitForToolSelected } from "./ui-helpers";

const waitForDrawingSave = async (page: Page, drawingId: string) => {
  await page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.url().includes(`/drawings/${drawingId}`),
    { timeout: 20000 }
  );
};

Given("the dashboard is open", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
});

Given("a drawing in the trash named {string}", async function (this: ExcaliDashWorld, name: string) {
  if (!this.request) throw new Error("Request not initialized");
  const drawing = await createDrawing(this.request, { name, collectionId: "trash" });
  this.createdDrawingIds.push(drawing.id);
  this.scenarioData.drawingId = drawing.id;
});

When("I create a new drawing", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const newDrawingButton = this.page.getByRole("button", { name: /New Drawing/i });
  await newDrawingButton.click();
  await this.page.waitForURL(/\/editor\//);
  const url = this.page.url();
  const match = url.match(/\/editor\/([^/]+)/);
  if (!match) throw new Error("Drawing ID not found in URL");
  this.scenarioData.drawingId = match[1];
  this.createdDrawingIds.push(match[1]);
});

Then("I should see the editor for that drawing", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
});

Then("the drawing should be stored with the name {string}", async function (this: ExcaliDashWorld, name: string) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const drawing = await getDrawing(this.request, drawingId);
  expect(drawing.name).toBe(name);
});

When("I open the drawing from the dashboard", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  await applyDashboardSearch(this.page, "");
  const card = this.page.locator(`#drawing-card-${drawingId}`);
  await card.click();
});

When("I rename the drawing to {string} in the editor header", async function (this: ExcaliDashWorld, newName: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const drawing = await getDrawing(this.request, drawingId);
  await this.page.goto(`${this.baseUrl}/editor/${drawingId}`);
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

  const nameElement = this.page.getByText(drawing.name);
  await nameElement.dblclick();

  const nameInput = this.page.locator("input").filter({ hasText: "" }).first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.clear();
  await nameInput.fill(newName);
  await nameInput.press("Enter");
  await waitForDrawingSave(this.page, drawingId);
});

Then("the drawing name should be {string}", async function (this: ExcaliDashWorld, newName: string) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const updatedDrawing = await getDrawing(this.request, drawingId);
  expect(updatedDrawing.name).toBe(newName);
});

When("I return to the dashboard from the editor", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/editor/${drawingId}`);
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  const backButton = this.page.locator("header button").first();
  await backButton.click();
  await this.page.waitForURL(`${this.baseUrl}/`);
});

Then("I should see the dashboard search input", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await expect(this.page.getByPlaceholder("Search drawings...")).toBeVisible();
});

When("I draw a rectangle on the canvas", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/editor/${drawingId}`);
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

  const canvas = this.page.locator("canvas.excalidraw__canvas.interactive");
  await this.page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "attached", timeout: 15000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");

  const rectangleLabel = this.page.locator(
    "label:has([data-testid=\"toolbar-rectangle\"])"
  );
  await rectangleLabel.click();
  await waitForToolSelected(this.page, "toolbar-rectangle");

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const startX = centerX - 100;
  const startY = centerY - 75;
  const endX = centerX + 100;
  const endY = centerY + 75;

  await this.page.mouse.click(centerX, centerY);

  await this.page.mouse.move(startX, startY);
  await this.page.mouse.down();
  await this.page.mouse.move(endX, endY, { steps: 20 });
  await this.page.mouse.up();

  await this.page.keyboard.press("Escape");
  await waitForDrawingSave(this.page, drawingId);
});

When("I draw text {string} on the canvas", async function (this: ExcaliDashWorld, text: string) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/editor/${drawingId}`);
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

  const canvas = this.page.locator("canvas.excalidraw__canvas.interactive");
  await this.page.locator('[data-testid="toolbar-text"]').waitFor({ state: "attached", timeout: 15000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");

  await this.page.mouse.click(box.x + 100, box.y + 100);

  await this.page.keyboard.press("t");
  await waitForToolSelected(this.page, "toolbar-text");

  await this.page.mouse.click(box.x + 300, box.y + 300);
  await this.page.waitForFunction(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "textarea" || el.getAttribute("contenteditable") === "true";
  });

  await this.page.keyboard.type(text);
  await this.page.keyboard.press("Escape");
  await this.page.waitForFunction(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return false;
    return el.getAttribute("contenteditable") !== "true";
  });
  await waitForDrawingSave(this.page, drawingId);
});

When("I undo and redo the change", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.keyboard.press("Meta+z");
  await this.page.keyboard.press("Meta+Shift+z");
});

Then("the editor should remain responsive", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await expect(this.page.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
});


When("I move the drawing to the trash", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);

  const card = this.page.locator(`#drawing-card-${drawingId}`);
  await card.hover();
  const selectToggle = card.locator(`[data-testid="select-drawing-${drawingId}"]`);
  await selectToggle.click();
  await this.page.getByTitle("Move to Trash").click();
});

Then("the drawing should appear in the trash view", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.getByRole("button", { name: /^Trash$/ }).click();
  await this.page.waitForLoadState("networkidle");
  await expect(this.page.locator(`#drawing-card-${drawingId}`)).toBeVisible();
});

When("I permanently delete the drawing from the trash", async function (this: ExcaliDashWorld) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/?view=trash`);
  await this.page.getByRole("button", { name: /^Trash$/ }).click();
  await this.page.waitForLoadState("networkidle");

  const card = this.page.locator(`#drawing-card-${drawingId}`);
  await card.hover();
  const selectToggle = card.locator(`[data-testid="select-drawing-${drawingId}"]`);
  await selectToggle.click();

  await this.page.getByTitle("Delete Permanently").click();
  await this.page.getByRole("button", { name: /Delete \d+ Drawings?/i }).click();
});

Then("the drawing should be removed from the system", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const response = await this.request.get(`${this.apiUrl}/drawings/${drawingId}`);
  expect(response.status()).toBe(404);
});

When("I duplicate the drawing from the dashboard", async function (this: ExcaliDashWorld) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);

  const card = this.page.locator(`#drawing-card-${drawingId}`);
  await card.hover();
  const selectToggle = card.locator(`[data-testid="select-drawing-${drawingId}"]`);
  await selectToggle.click();
  const duplicateResponse = this.page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/drawings/${drawingId}/duplicate`),
    { timeout: 15000 }
  );
  await this.page.getByTitle("Duplicate Selected").click();
  await duplicateResponse;
});

Then("I should see two drawings matching {string}", async function (this: ExcaliDashWorld, namePrefix: string) {
  if (!this.request) throw new Error("Request not initialized");
  const results = await listDrawings(this.request, { search: namePrefix });
  expect(results.length).toBeGreaterThanOrEqual(2);
  for (const drawing of results) {
    if (!this.createdDrawingIds.includes(drawing.id)) {
      this.createdDrawingIds.push(drawing.id);
    }
  }
});

When("I export the drawing from its card menu", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  const card = this.page.locator(`#drawing-card-${drawingId}`);
  await card.click({ button: "right" });
  const exportButton = this.page.getByRole("button", { name: /^Export$/i });
  const downloadPromise = this.page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
  const exportError = this.page.getByText(/Failed to export drawing/i);
  await exportButton.click();
  await Promise.race([
    downloadPromise,
    exportError.waitFor({ state: "visible", timeout: 10000 }).catch(() => null),
  ]);
});

Then("the export should complete without error", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const exportError = this.page.getByText(/Failed to export drawing/i);
  await expect(exportError).toHaveCount(0);
});

When("I move the drawing to the trash using bulk actions", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  await applyDashboardSearch(this.page, "");
  await ensureCardSelected(this.page, drawingId);
  await this.page.getByTitle("Move to Trash").click();
});
