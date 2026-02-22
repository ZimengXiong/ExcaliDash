import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";

Then("I should see {int} drawings matching {string}", async function (this: ExcaliDashWorld, count: number, term: string) {
  if (!this.page) throw new Error("Page not initialized");
  const searchInput = this.page.getByPlaceholder("Search drawings...");
  if (term) {
    await searchInput.fill("");
    await searchInput.fill(term);
  }

  const page = this.page;
  if (term === "Import_Multi") {
    await expect.poll(async () => {
      const cards = page.locator("[id^='drawing-card-']");
      return cards.count();
    }, { timeout: 30000 }).toBeGreaterThanOrEqual(count);
  } else {
    await expect.poll(async () => {
      const cards = page.locator("[id^='drawing-card-']");
      return cards.count();
    }, { timeout: 30000 }).toBe(count);
  }

  const cards = page.locator("[id^='drawing-card-']");
  for (let i = 0; i < count; i += 1) {
    const card = cards.nth(i);
    await expect(card).toBeVisible();
  }
});

Then("I should be on the login page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await expect(this.page).toHaveURL(/\/login/);
  await expect(this.page.getByRole("heading", { name: /Sign in/i })).toBeVisible();
});
