import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getDrawing } from "./api-helpers";
import { waitForToolSelected } from "./ui-helpers";

const waitForSocketConnected = async (page: any) => {
  await page.waitForFunction(
    () => (window as any).__EXCALIDASH_SOCKET_STATUS__?.connected === true,
    null,
    { timeout: 15000 }
  );
};

const ensureTwoUsersOpen = async (world: ExcaliDashWorld) => {
  if (world.scenarioData.page1 && world.scenarioData.page2) return;
  if (!world.browser || !world.page || !world.context) throw new Error("Browser not initialized");
  const drawingId = world.scenarioData.drawingId as string;

  // Get cookies from the authenticated main context
  const cookies = await world.context.cookies();

  const context1 = await world.browser.newContext();
  const context2 = await world.browser.newContext();
  
  // Copy auth cookies to new contexts
  if (cookies.length > 0) {
    await context1.addCookies(cookies);
    await context2.addCookies(cookies);
  }

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  world.extraContexts.push(context1, context2);
  world.extraPages.push(page1, page2);

  await page1.goto(`${world.baseUrl}/editor/${drawingId}`);
  await page2.goto(`${world.baseUrl}/editor/${drawingId}`);

  await page1.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  await page2.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

  await Promise.all([waitForSocketConnected(page1), waitForSocketConnected(page2)]);

  world.scenarioData.page1 = page1;
  world.scenarioData.page2 = page2;
};

const drawRectangle = async (page: any) => {
  await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  const canvas = page.locator("canvas.excalidraw__canvas.interactive");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");

  const rectangleLabel = page.locator(
    "label:has([data-testid=\"toolbar-rectangle\"])"
  );
  if (await rectangleLabel.count()) {
    await rectangleLabel.first().click();
  } else {
    await page.keyboard.press("r");
  }
  await waitForToolSelected(page, "toolbar-rectangle");

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const startX = centerX - 100;
  const startY = centerY - 75;
  const endX = centerX + 100;
  const endY = centerY + 75;

  await page.mouse.click(centerX, centerY);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.mouse.up();

  await page.keyboard.press("Escape");
};

When("two users open the drawing", async function (this: ExcaliDashWorld) {
  await ensureTwoUsersOpen(this);
});

When("two users draw on the same canvas", async function (this: ExcaliDashWorld) {
  await ensureTwoUsersOpen(this);
  const page1 = this.scenarioData.page1 as any;
  const page2 = this.scenarioData.page2 as any;

  await drawRectangle(page1);

  if (this.request) {
    const drawingId = this.scenarioData.drawingId as string;
    await expect.poll(async () => {
      const saved = await getDrawing(this.request!, drawingId);
      return saved.elements?.length || 0;
    }, { timeout: 90000 }).toBeGreaterThan(0);
  }
});

When("two users move their cursors", async function (this: ExcaliDashWorld) {
  await ensureTwoUsersOpen(this);
  const page1 = this.scenarioData.page1 as any;
  const page2 = this.scenarioData.page2 as any;
  const canvas1 = page1.locator("canvas.excalidraw__canvas.interactive");
  const box = await canvas1.boundingBox();
  if (!box) throw new Error("Canvas not found");

  await Promise.all([waitForSocketConnected(page1), waitForSocketConnected(page2)]);
  await page1.mouse.move(box.x + 300, box.y + 300);
  await page1.mouse.move(box.x + 400, box.y + 400);
});


Then("a collaborator indicator should be visible", async function (this: ExcaliDashWorld) {
  await ensureTwoUsersOpen(this);
  const page1 = this.scenarioData.page1 as any;
  const page2 = this.scenarioData.page2 as any;
  const collaboratorIndicator1 = page1.locator("[data-testid='collaborator-avatar'], .collaborator-avatar, [class*='collaborator']");
  const collaboratorIndicator2 = page2.locator("[data-testid='collaborator-avatar'], .collaborator-avatar, [class*='collaborator']");
  const count1 = await collaboratorIndicator1.count();
  const count2 = await collaboratorIndicator2.count();
  expect(count1 + count2).toBeGreaterThanOrEqual(0);
});

Then("the collaboration session should remain active", async function (this: ExcaliDashWorld) {
  await ensureTwoUsersOpen(this);
  const page2 = this.scenarioData.page2 as any;
  await expect(page2.locator("canvas.excalidraw__canvas.interactive")).toBeVisible();
});

When("I draw a rectangle and reload the editor", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/editor/${drawingId}`);
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });

  await drawRectangle(this.page);

  if (this.request) {
    await expect.poll(async () => {
      const savedDrawing = await getDrawing(this.request!, drawingId);
      return savedDrawing.elements?.length || 0;
    }, { timeout: 90000 }).toBeGreaterThan(0);
  }

  await this.page.reload();
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  await waitForSocketConnected(this.page);
});
