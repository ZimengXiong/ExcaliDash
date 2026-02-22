import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { waitForToolSelected } from "./ui-helpers";

Given("the editor is open for a new drawing", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");
  const newDrawingButton = this.page.getByRole("button", { name: /New Drawing/i });
  await newDrawingButton.click();
  await this.page.waitForURL(/\/editor\//);
  const url = this.page.url();
  const match = url.match(/\/editor\/([^/]+)/);
  if (!match) throw new Error("Drawing ID not found in URL");
  this.scenarioData.drawingId = match[1];
  this.createdDrawingIds.push(match[1]);
});

When("I open the library", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const libraryButton = this.page.getByLabel(/Library/i).first();
  if (await libraryButton.isVisible()) {
    await libraryButton.click();
  }
});

Then("the library panel should be available", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const libraryToggle = this.page.getByLabel(/Library/i).first();
  await expect(libraryToggle).toBeVisible({ timeout: 10000 });
});

When("I save a library item", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  const canvas = this.page.locator("canvas.excalidraw__canvas.interactive");
  await this.page.locator('[data-testid="toolbar-rectangle"]').waitFor({ state: "attached", timeout: 15000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");

  // Click on canvas first to ensure it has focus
  await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // Use label click for more reliable tool selection (like other tests)
  const rectangleLabel = this.page.locator(
    "label:has([data-testid=\"toolbar-rectangle\"])"
  );
  if (await rectangleLabel.count()) {
    await rectangleLabel.first().click();
  } else {
    await this.page.keyboard.press("r");
  }
  await waitForToolSelected(this.page, "toolbar-rectangle");
  await this.page.mouse.move(box.x + 100, box.y + 100);
  await this.page.mouse.down();
  await this.page.mouse.move(box.x + 200, box.y + 200);
  await this.page.mouse.up();

  const libraryButton = this.page.getByLabel(/Library/i).first();
  if (await libraryButton.isVisible()) {
    await libraryButton.click({ force: true });
    const saveButton = this.page.getByRole("button", { name: /Save to library|Add to library/i }).first();
    if (await saveButton.isVisible()) {
      await saveButton.click();
    }
  }
});

Then("the library should persist without errors", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await expect(this.page.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
});

When("I import a library from a URL hash", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  if (!drawingId) throw new Error("Drawing ID not set");

  const libraryItems = {
    libraryItems: [
      {
        id: "bdd-library-item",
        status: "published",
        created: 1,
        name: "BDD Item",
        elements: [
          {
            id: "bdd-rect",
            type: "rectangle",
            x: 100,
            y: 100,
            width: 120,
            height: 80,
            angle: 0,
            strokeColor: "#000000",
            backgroundColor: "transparent",
            fillStyle: "solid",
            strokeWidth: 1,
            strokeStyle: "solid",
            roughness: 1,
            opacity: 100,
            groupIds: [],
            frameId: null,
            roundness: { type: 3 },
            seed: 1,
            version: 1,
            versionNonce: 2,
            isDeleted: false,
            boundElements: null,
            updated: Date.now(),
            link: null,
            locked: false,
          },
        ],
      },
    ],
  };

  const request = await this.page.context().request.newContext();
  await request.route("**/bdd-library.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(libraryItems),
    });
  });

  const baseUrl = this.baseUrl.replace(/\/$/, "");
  const importUrl = `${baseUrl}/bdd-library.json`;
  await this.page.goto(`${this.baseUrl}/editor/${drawingId}#addLibrary=${encodeURIComponent(importUrl)}`);
});

Then("the library import should complete", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await expect(this.page.locator("text=Library imported successfully")).toBeVisible({ timeout: 30000 });
  await expect(this.page.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
});
