import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import {
  createDrawing,
  getDrawing,
  updateDrawingRaw,
} from "./api-helpers";
import { waitForToolSelected } from "./ui-helpers";

When("I open the drawing in the editor", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  await this.page.goto(`${this.baseUrl}/editor/${drawingId}`);
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

  // Wait for socket connection
  await this.page.waitForFunction(
    () => (window as any).__EXCALIDASH_SOCKET_STATUS__?.connected === true,
    null,
    { timeout: 15000 }
  ).catch(() => {
    // Socket might not connect in all test environments
  });
});

When("I draw a shape on the canvas", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");

  const canvas = this.page.locator("canvas.excalidraw__canvas.interactive");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");

  // Select rectangle tool
  const rectangleLabel = this.page.locator(
    "label:has([data-testid=\"toolbar-rectangle\"])"
  );
  if (await rectangleLabel.count()) {
    await rectangleLabel.first().click();
  } else {
    await this.page.keyboard.press("r");
  }
  await waitForToolSelected(this.page, "toolbar-rectangle");

  // Draw a rectangle
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await this.page.mouse.move(centerX - 50, centerY - 50);
  await this.page.mouse.down();
  await this.page.mouse.move(centerX + 50, centerY + 50, { steps: 10 });
  await this.page.mouse.up();

  // Press Escape to deselect
  await this.page.keyboard.press("Escape");
});

Then("the drawing should be saved with the new content", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  // Poll the API to verify the drawing has been saved with elements
  await expect.poll(async () => {
    const drawing = await getDrawing(this.request!, drawingId);
    return drawing.elements?.length || 0;
  }, { timeout: 90000 }).toBeGreaterThan(0);
});

When("I update the drawing with version 1 from the API", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  // First update - should succeed
  const result = await updateDrawingRaw(this.request, drawingId, {
    name: "Conflict Test Updated",
    elements: [
      {
        id: "conflict-rect-1",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      },
    ],
    appState: { viewBackgroundColor: "#ffffff" },
  });

  expect(result.ok).toBe(true);

  // Get the current version
  const drawing = await getDrawing(this.request, drawingId);
  this.scenarioData.currentVersion = drawing.version;
});

When("I update the drawing again with a stale version", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  // Use version 0 (stale) to trigger conflict
  const result = await updateDrawingRaw(this.request, drawingId, {
    name: "Conflict Test Stale",
    version: 0,
    elements: [
      {
        id: "conflict-rect-2",
        type: "rectangle",
        x: 200,
        y: 200,
        width: 100,
        height: 100,
      },
    ],
    appState: { viewBackgroundColor: "#ffffff" },
  });

  this.scenarioData.conflictResult = result;
});

Then("the update should fail with a version conflict error", async function (this: ExcaliDashWorld) {
  const result = this.scenarioData.conflictResult as { ok: boolean; status: number };
  expect(result.ok).toBe(false);
  expect(result.status).toBe(409);
});
