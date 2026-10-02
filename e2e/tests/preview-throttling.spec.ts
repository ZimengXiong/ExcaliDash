import { test, expect } from "@playwright/test";
import { createDrawing, deleteDrawing } from "./helpers/api";

test("dashboard rerenders do not amplify throttled preview requests", async ({
  page,
  request,
}) => {
  const drawing = await createDrawing(request, {
    name: `Preview throttle ${Date.now()}`,
  });
  let previews = 0;
  let fullDrawings = 0;
  page.on("request", (sent) => {
    if (
      sent.method() === "GET" &&
      new URL(sent.url()).pathname.endsWith(`/drawings/${drawing.id}`)
    )
      fullDrawings++;
  });
  await page.route(`**/drawings/${drawing.id}/preview*`, async (route) => {
    previews++;
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "Too many requests" }),
    });
  });
  try {
    await page.goto("/");
    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect.poll(() => previews).toBeGreaterThan(0);
    await page.waitForLoadState("networkidle");
    const initial = previews;
    const selection = card.getByTestId(`select-drawing-${drawing.id}`);
    for (const pressed of ["true", "false", "true"]) {
      await card.hover();
      await selection.click();
      await expect(selection).toHaveAttribute("aria-pressed", pressed);
    }
    await page.waitForLoadState("networkidle");
    expect(previews).toBe(initial);
    expect(fullDrawings).toBe(0);
  } finally {
    await deleteDrawing(request, drawing.id);
  }
});
