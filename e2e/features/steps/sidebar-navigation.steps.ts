import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import {
  createDrawing,
  createCollection,
  updateDrawing,
  listDrawings,
} from "./api-helpers";
import { waitForDashboard, applyDashboardSearch } from "./ui-helpers";

When(
  "I click {string} in the sidebar",
  async function (this: ExcaliDashWorld, itemName: string) {
    if (!this.page) throw new Error("Page not initialized");

    // Open sidebar on mobile if needed
    const hamburger = this.page.locator("button.md\\:hidden, [aria-label='Open menu']").first();
    if (await hamburger.isVisible().catch(() => false)) {
      await hamburger.click();
      await this.page.waitForTimeout(500);
    }

    const sidebarItem = this.page.getByRole("button", { name: itemName }).first();
    await expect(sidebarItem).toBeVisible({ timeout: 10000 });
    await sidebarItem.click();

    // Wait for navigation
    await this.page.waitForLoadState("networkidle");
  }
);

When(
  "I click collection {string} in the sidebar",
  async function (this: ExcaliDashWorld, collectionName: string) {
    if (!this.page) throw new Error("Page not initialized");

    // Open sidebar on mobile if needed
    const hamburger = this.page.locator("button.md\\:hidden, [aria-label='Open menu']").first();
    if (await hamburger.isVisible().catch(() => false)) {
      await hamburger.click();
      await this.page.waitForTimeout(500);
    }

    const sidebarItem = this.page.getByRole("button", { name: collectionName }).first();
    await expect(sidebarItem).toBeVisible({ timeout: 10000 });
    await sidebarItem.click();

    await this.page.waitForLoadState("networkidle");
  }
);

Then("I should see drawings on the dashboard", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");

  await expect.poll(async () => {
    const cardCount = await this.page!.locator("[id^='drawing-card-']").count();
    return cardCount;
  }, { timeout: 10000 }).toBeGreaterThan(0);
});

Then(
  "I should see the drawing {string} on the dashboard",
  async function (this: ExcaliDashWorld, drawingName: string) {
    if (!this.page) throw new Error("Page not initialized");

    await expect.poll(async () => {
      const cards = this.page!.locator("[id^='drawing-card-']");
      const count = await cards.count();
      for (let i = 0; i < count; i++) {
        const text = await cards.nth(i).textContent();
        if (text && text.includes(drawingName)) return true;
      }
      return false;
    }, { timeout: 15000 }).toBe(true);
  }
);

Given(
  "the drawing is moved into collection {string}",
  async function (this: ExcaliDashWorld, collectionName: string) {
    if (!this.request) throw new Error("Request not initialized");
    const drawingId = this.scenarioData.drawingId as string;
    const collectionId = this.scenarioData.collectionId as string;

    if (!collectionId) {
      throw new Error("Collection ID not found in scenario data");
    }

    await updateDrawing(this.request, drawingId, { collectionId });
  }
);

Given("the drawing is moved to trash", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  await updateDrawing(this.request, drawingId, { collectionId: "trash" } as any);
});

Then("I should see the shared drawings view", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");

  // The URL should reflect the shared view
  await expect.poll(async () => {
    const url = this.page!.url();
    return url.includes("shared") || url.includes("collections");
  }, { timeout: 10000 }).toBe(true);
});
