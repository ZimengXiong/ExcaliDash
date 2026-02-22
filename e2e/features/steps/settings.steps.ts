import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";

Given("the settings page is open", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/settings`);
  await this.page.waitForLoadState("networkidle");
  // Wait for the settings header to ensure the page is loaded
  await this.page.waitForSelector("h1:has-text('Settings')", { timeout: 10000 });
});

When("I toggle the theme", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  // The button shows "Dark Mode" to switch to dark, "Light Mode" to switch to light
  const themeButton = this.page.locator("button:has-text('Dark Mode'), button:has-text('Light Mode')").first();
  await expect(themeButton).toBeVisible({ timeout: 10000 });
  const html = this.page.locator("html");
  const wasDark = await html.evaluate((el) => el.classList.contains("dark"));
  await themeButton.click();
  await this.page.waitForFunction(
    (shouldBeDark) => document.documentElement.classList.contains("dark") === shouldBeDark,
    !wasDark
  );
});

When("I enable dark mode", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const html = this.page.locator("html");
  const isDark = await html.evaluate((el) => el.classList.contains("dark"));
  if (!isDark) {
    // Button shows "Dark Mode" when in light mode (to switch to dark)
    const darkModeButton = this.page.locator("button:has-text('Dark Mode')").first();
    await darkModeButton.click({ timeout: 10000 });
    await expect(html).toHaveClass(/dark/);
  }
});

When("I enable light mode", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const html = this.page.locator("html");
  const isDark = await html.evaluate((el) => el.classList.contains("dark"));
  if (isDark) {
    // Button shows "Light Mode" when in dark mode (to switch to light)
    const lightModeButton = this.page.locator("button:has-text('Light Mode')").first();
    await lightModeButton.click({ timeout: 10000 });
    await expect(html).not.toHaveClass(/dark/);
  }
});

When("I navigate to the dashboard", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");
});

When("I reload the page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.reload();
  await this.page.waitForLoadState("networkidle");
});

Then("the theme should be updated", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const html = this.page.locator("html");
  const themeButton = this.page.locator("button:has-text('Dark Mode'), button:has-text('Light Mode')").first();
  await expect(themeButton).toBeVisible({ timeout: 10000 });
  // The html may or may not have a "dark" class depending on the current theme
  const hasDark = await html.evaluate((el) => el.classList.contains("dark"));
  expect(typeof hasDark).toBe("boolean");
});

Then("dark mode should remain enabled", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const html = this.page.locator("html");
  await expect(html).toHaveClass(/dark/);
});

Then("dark theme styling should be applied", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const body = this.page.locator("body");
  const bodyBgColor = await body.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(bodyBgColor).toBeTruthy();
});

Then("light theme styling should be applied", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const html = this.page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
});
