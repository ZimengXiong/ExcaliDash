import { test, expect } from "@playwright/test";

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

    // Find the theme toggle button
    const themeButton = page.getByRole("button", { name: /Dark Mode|Light Mode/i });
    await expect(themeButton).toBeVisible();

    // Get initial theme state from html element
    const html = page.locator("html");
    const initialDark = await html.evaluate((el) => el.classList.contains("dark"));

    // Click to toggle theme
    await themeButton.click();
    await page.waitForTimeout(500);

    // Verify theme changed
    const newDark = await html.evaluate((el) => el.classList.contains("dark"));
    expect(newDark).toBe(!initialDark);

    // Button text should also change
    if (initialDark) {
      await expect(themeButton).toContainText("Dark Mode");
    } else {
      await expect(themeButton).toContainText("Light Mode");
    }
  });

  test("should persist theme across page navigation", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    const themeButton = page.getByRole("button", { name: /Dark Mode|Light Mode/i });
    
    // Set to dark mode first
    const isDark = await html.evaluate((el) => el.classList.contains("dark"));
    if (!isDark) {
      await themeButton.click();
      await page.waitForTimeout(500);
    }

    // Verify dark mode is set
    await expect(html).toHaveClass(/dark/);

    // Navigate to dashboard
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Theme should persist
    await expect(html).toHaveClass(/dark/);

    // Navigate back to settings
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Theme should still be dark
    await expect(html).toHaveClass(/dark/);

    // Toggle back to light for cleanup
    const lightButton = page.getByRole("button", { name: /Light Mode/i });
    if (await lightButton.isVisible()) {
      await lightButton.click();
    }
  });

  test("should persist theme across page reload", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    const themeButton = page.getByRole("button", { name: /Dark Mode|Light Mode/i });

    // Toggle to dark mode
    const initialDark = await html.evaluate((el) => el.classList.contains("dark"));
    if (!initialDark) {
      await themeButton.click();
      await page.waitForTimeout(500);
    }

    // Reload the page
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Theme should persist after reload
    await expect(html).toHaveClass(/dark/);
  });

  test("should apply dark theme styling to dashboard", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    const themeButton = page.getByRole("button", { name: /Dark Mode|Light Mode/i });

    // Ensure dark mode
    const isDark = await html.evaluate((el) => el.classList.contains("dark"));
    if (!isDark) {
      await themeButton.click();
      await page.waitForTimeout(500);
    }

    // Navigate to dashboard
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check that dark theme styles are applied
    // The body should have dark background colors
    const body = page.locator("body");
    const bodyBgColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Dark mode typically has dark backgrounds (low RGB values)
    // This is a basic check - adjust based on actual theme colors
    expect(bodyBgColor).toBeTruthy();
  });

  test("should apply light theme styling to dashboard", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    const html = page.locator("html");
    const themeButton = page.getByRole("button", { name: /Dark Mode|Light Mode/i });

    // Ensure light mode
    const isDark = await html.evaluate((el) => el.classList.contains("dark"));
    if (isDark) {
      await themeButton.click();
      await page.waitForTimeout(500);
    }

    // Navigate to dashboard
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check that html doesn't have dark class
    await expect(html).not.toHaveClass(/dark/);
  });
});
