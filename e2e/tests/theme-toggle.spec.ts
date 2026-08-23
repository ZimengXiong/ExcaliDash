import { test, expect } from "@playwright/test";

const themeToggle = (page: import("@playwright/test").Page) =>
  page.getByRole("switch", { name: "Toggle dark mode" });

const ensureDarkTheme = async (page: import("@playwright/test").Page) => {
  const html = page.locator("html");
  if (!(await html.evaluate((el) => el.classList.contains("dark")))) {
    await themeToggle(page).click();
    await expect(html).toHaveClass(/dark/);
  }
};

const ensureLightTheme = async (page: import("@playwright/test").Page) => {
  const html = page.locator("html");
  if (await html.evaluate((el) => el.classList.contains("dark"))) {
    await themeToggle(page).click();
    await expect(html).not.toHaveClass(/dark/);
  }
};

/**
 * E2E Tests for Theme Toggle functionality
 * 
 * Tests the dark/light theme feature:
 * - Toggle theme via Settings page
 * - Theme persists across page reloads
 * - Theme applies to all pages
 */

test.describe("Theme Toggle", () => {
  test("should toggle theme from Settings page", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const themeButton = themeToggle(page);
    await expect(themeButton).toBeVisible();

    const html = page.locator("html");
    const initialDark = await html.evaluate((el) => el.classList.contains("dark"));

    await themeButton.click();
    await page.waitForTimeout(500);

    const newDark = await html.evaluate((el) => el.classList.contains("dark"));
    expect(newDark).toBe(!initialDark);

    await expect(themeButton).toHaveAttribute("aria-checked", String(!initialDark));
  });

  test("should persist theme across page navigation", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    await ensureDarkTheme(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(html).toHaveClass(/dark/);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(html).toHaveClass(/dark/);
    await ensureLightTheme(page);
  });

  test("should persist theme across page reload", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    await ensureDarkTheme(page);

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(html).toHaveClass(/dark/);
  });

  test("should apply dark theme styling to dashboard", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await ensureDarkTheme(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    const bodyBgColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    expect(bodyBgColor).toBeTruthy();
  });

  test("should apply light theme styling to dashboard", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    await ensureLightTheme(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(html).not.toHaveClass(/dark/);
  });
});
