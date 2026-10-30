import { test, expect, type Page } from "@playwright/test";

type ThemeChoice = "Light" | "Dark" | "System";

const themeSelect = (page: Page) =>
  page.getByRole("button", { name: "Theme", exact: true });

const chooseTheme = async (page: Page, choice: ThemeChoice) => {
  await themeSelect(page).click();
  await page.getByRole("option", { name: choice, exact: true }).click();
  await expect(themeSelect(page)).toHaveText(choice);
};

const isDark = (page: Page) =>
  page.locator("html").evaluate((el) => el.classList.contains("dark"));

/**
 * E2E Tests for the theme preference
 *
 * Covers the light/dark/system feature:
 * - Pick a theme on the Settings page
 * - Theme persists across navigation and reloads
 * - "System" follows the OS color scheme, live
 * - An explicit choice ignores the OS color scheme
 * - The OS theme applies before React mounts (no flash)
 */

test.describe("Theme preference", () => {
  test("should switch theme from Settings page", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    await expect(themeSelect(page)).toBeVisible();

    await chooseTheme(page, "Dark");
    await expect(html).toHaveClass(/dark/);

    await chooseTheme(page, "Light");
    await expect(html).not.toHaveClass(/dark/);
  });

  test("should persist theme across page navigation", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    await chooseTheme(page, "Dark");
    await expect(html).toHaveClass(/dark/);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(html).toHaveClass(/dark/);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await expect(html).toHaveClass(/dark/);
    await expect(themeSelect(page)).toHaveText("Dark");
  });

  test("should persist theme across page reload", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    await chooseTheme(page, "Dark");
    await expect(html).toHaveClass(/dark/);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(html).toHaveClass(/dark/);
    await expect(themeSelect(page)).toHaveText("Dark");
  });

  test("should follow the OS color scheme while set to System", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    // A fresh browser context has no stored choice, so System is the default.
    await expect(themeSelect(page)).toHaveText("System");
    await expect(html).not.toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: "light" });
    await expect(html).not.toHaveClass(/dark/);
  });

  test("should keep an explicit choice when the OS color scheme changes", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);

    await chooseTheme(page, "Light");
    await expect(html).not.toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).not.toHaveClass(/dark/);

    await chooseTheme(page, "System");
    await expect(html).toHaveClass(/dark/);
  });

  test("should apply the OS theme before React mounts", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });

    // Capture the html class as soon as the document is parsed, before any
    // React effect could have run.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { __darkAtLoad?: boolean }).__darkAtLoad =
          document.documentElement.classList.contains("dark");
      });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(
      await page.evaluate(
        () => (window as unknown as { __darkAtLoad?: boolean }).__darkAtLoad,
      ),
    ).toBe(true);
    expect(await isDark(page)).toBe(true);
  });

  test("should apply dark theme styling to dashboard", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await chooseTheme(page, "Dark");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    const bodyBgColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    expect(bodyBgColor).toBeTruthy();
    expect(await isDark(page)).toBe(true);
  });

  test("should apply light theme styling to dashboard", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    await chooseTheme(page, "Light");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(html).not.toHaveClass(/dark/);
  });
});
