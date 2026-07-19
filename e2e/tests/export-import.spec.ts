import { expect, test } from "@playwright/test";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getCsrfHeaders,
} from "./helpers/api";

test.describe("ExcaliDash export and import", () => {
  const createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds.splice(0)) {
      try {
        await deleteDrawing(request, id);
      } catch {
        // The import may already have changed or removed test data.
      }
    }
  });

  test("shows a single .excalidash export and import path", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: "Export Backup" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Export$/ })).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Download name" }),
    ).toHaveCount(0);

    const advanced = page.locator("details", { hasText: "Advanced" });
    await advanced.locator("summary").click();
    await expect(
      page.getByRole("heading", { name: "Import Backup" }),
    ).toBeVisible();
    await expect(page.locator("#settings-import-backup")).toHaveAttribute(
      "accept",
      ".excalidash",
    );
    await expect(page.getByText("Legacy Import")).toHaveCount(0);
  });

  test("exports only a .excalidash download name", async ({ request }) => {
    const drawing = await createDrawing(request, {
      name: `Export_API_${Date.now()}`,
    });
    createdDrawingIds.push(drawing.id);

    const response = await request.get(`${API_URL}/export/excalidash?ext=zip`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/application\/zip/);
    expect(response.headers()["content-disposition"]).toMatch(
      /excalidash-backup.*\.excalidash"/,
    );
    expect(response.headers()["content-disposition"]).not.toContain(
      ".excalidash.zip",
    );
  });

  test("imports a .excalidash archive from the dashboard", async ({
    page,
    request,
  }) => {
    const drawing = await createDrawing(request, {
      name: `Import_Archive_${Date.now()}`,
    });
    createdDrawingIds.push(drawing.id);
    const exported = await request.get(`${API_URL}/export/excalidash`);
    expect(exported.ok()).toBe(true);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#dashboard-import")).toHaveAttribute(
      "accept",
      ".excalidash",
    );
    await page.locator("#dashboard-import").setInputFiles({
      name: "dashboard-backup.excalidash",
      mimeType: "application/zip",
      buffer: await exported.body(),
    });

    await expect(page.getByText("Uploads (Done)")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Failed")).toHaveCount(0);
  });

  test("rejects legacy dashboard files with the required-format message", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.locator("#dashboard-import").setInputFiles({
      name: "drawing.excalidraw",
      mimeType: "application/json",
      buffer: Buffer.from("{}"),
    });

    await expect(page.getByText("Uploads (Done)")).toBeVisible();
    await expect(page.getByText("A .excalidash file is required.")).toBeVisible();
  });

  test("rejects legacy extensions at the API boundary", async ({ request }) => {
    const response = await request.post(`${API_URL}/import/excalidash/verify`, {
      headers: await getCsrfHeaders(request),
      multipart: {
        archive: {
          name: "backup.zip",
          mimeType: "application/zip",
          buffer: Buffer.from("not relevant"),
        },
      },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "A .excalidash file is required.",
    });
  });

  test("legacy SQLite import endpoint is removed", async ({ request }) => {
    const response = await request.post(`${API_URL}/import/sqlite/legacy/verify`, {
      headers: await getCsrfHeaders(request),
    });
    expect(response.status()).toBe(404);
  });
});
