import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { applyDashboardSearch, waitForDashboard } from "./ui-helpers";

When("I search for {string}", async function (this: ExcaliDashWorld, term: string) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  await applyDashboardSearch(this.page, term);
  await expect.poll(async () => {
    const cardCount = await this.page!.locator("[id^='drawing-card-']").count();
    const emptyCount = await this.page!.getByText("No drawings found").count();
    return cardCount + emptyCount;
  }, { timeout: 10000 }).toBeGreaterThan(0);
});

Then("I should see the empty search state for {string}", async function (this: ExcaliDashWorld, term: string) {
  if (!this.page) throw new Error("Page not initialized");
  await expect(this.page.getByText("No drawings found")).toBeVisible();
  await expect(this.page.getByText(`No results for "${term}"`)).toBeVisible();
});

When("I clear the search", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await applyDashboardSearch(this.page, "");
  await expect.poll(async () => {
    const cardCount = await this.page!.locator("[id^='drawing-card-']").count();
    const emptyCount = await this.page!.getByText("No drawings found").count();
    return cardCount + emptyCount;
  }, { timeout: 10000 }).toBeGreaterThan(0);
});

Then("I should see drawings matching {string}", async function (this: ExcaliDashWorld, term: string) {
  if (!this.page) throw new Error("Page not initialized");
  await applyDashboardSearch(this.page, term);
  const cards = this.page.locator("[id^='drawing-card-']");
  await expect(cards.first()).toBeVisible();
});

When("I press the search keyboard shortcut", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  await this.page.keyboard.press("Meta+k");
});

Then("the search input should be focused", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const searchInput = this.page.getByPlaceholder("Search drawings...");
  await expect(searchInput).toBeFocused();
});

When("I sort drawings by {string}", async function (this: ExcaliDashWorld, label: string) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  const button = this.page.getByRole("button", { name: label });
  await button.click();
  await expect(button).toHaveClass(/bg-indigo-100|bg-neutral-800/);
});

When("I toggle sort {string} twice", async function (this: ExcaliDashWorld, label: string) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  const button = this.page.getByRole("button", { name: label });
  await button.click();
  const ascIcon = button.locator("svg").first();
  const descIcon = button.locator("svg").last();
  await expect(ascIcon).toHaveClass(/text-indigo-600|text-neutral-200/);
  await button.click();
  await expect(descIcon).toHaveClass(/text-indigo-600|text-neutral-200/);
});

Then("the {string} sort should be active", async function (this: ExcaliDashWorld, label: string) {
  if (!this.page) throw new Error("Page not initialized");
  const button = this.page.getByRole("button", { name: label });
  await expect(button).toHaveClass(/bg-indigo-100|bg-neutral-800/);
});
