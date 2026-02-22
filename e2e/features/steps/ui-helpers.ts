import { expect, Page, Locator } from "@playwright/test";

export const searchPlaceholder = "Search drawings...";

export async function waitForDashboard(page: Page) {
  await page.waitForLoadState("networkidle");
  // Check if we're on a login page - if so, we need auth
  const url = page.url();
  if (url.includes('/login')) {
    throw new Error(`Redirected to login page - authentication may have failed. URL: ${url}`);
  }
  await expect(page.getByPlaceholder(searchPlaceholder)).toBeVisible({ timeout: 15000 });
}

export async function applyDashboardSearch(page: Page, term: string) {
  const searchInput = page.getByPlaceholder(searchPlaceholder);
  await searchInput.waitFor();
  await searchInput.fill("");
  await searchInput.fill(term);

  const expectedSearch = term.trim();
  await page
    .waitForResponse(
      (response) => {
        if (response.request().method() !== "GET") return false;
        const url = response.url();
        if (!url.includes("/drawings")) return false;
        try {
          const parsed = new URL(url);
          const searchParam = parsed.searchParams.get("search") ?? "";
          return searchParam === expectedSearch;
        } catch {
          return false;
        }
      },
      { timeout: 5000 }
    )
    .catch(() => null);
}

export async function ensureCardVisible(page: Page, drawingId: string): Promise<Locator> {
  const card = page.locator(`#drawing-card-${drawingId}`);
  await card.waitFor({ state: "attached" });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  return card;
}

export async function ensureCardSelected(page: Page, drawingId: string) {
  const card = await ensureCardVisible(page, drawingId);
  const toggle = card.locator(`[data-testid="select-drawing-${drawingId}"]`);
  const pressed = await toggle.getAttribute("aria-pressed");
  if (pressed !== "true") {
    await card.hover();
    await toggle.click();
  }
}

export async function openDrawingInDashboard(page: Page, drawingId: string) {
  const card = page.locator(`#drawing-card-${drawingId}`);
  await card.click();
}

export async function waitForToolSelected(page: Page, testId: string) {
  const toolLocator = page.locator(`[data-testid="${testId}"]`);
  await toolLocator.waitFor({ state: "attached", timeout: 10000 });
  await page.waitForFunction((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return false;
    const input = el.tagName === "INPUT" ? (el as HTMLInputElement) : el.querySelector("input");
    if (input && "checked" in input) {
      return (input as HTMLInputElement).checked === true;
    }
    const ariaPressed = el.getAttribute("aria-pressed");
    const ariaChecked = el.getAttribute("aria-checked");
    const dataState = el.getAttribute("data-state");
    return (
      ariaPressed === "true" ||
      ariaChecked === "true" ||
      dataState === "active" ||
      dataState === "checked" ||
      el.classList.contains("active") ||
      el.classList.contains("selected")
    );
  }, testId, { timeout: 10000 });
}
