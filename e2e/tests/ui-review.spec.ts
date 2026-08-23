import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getCsrfHeaders,
  listDrawings,
  updateDrawing,
} from "./helpers/api";

const enabled = process.env.UI_REVIEW_SCREENSHOTS === "true";
const outputDir = process.env.UI_REVIEW_OUTPUT
  ? path.resolve(process.env.UI_REVIEW_OUTPUT)
  : path.resolve("test-results/ui-review");

const login = async (request: import("@playwright/test").APIRequestContext) => {
  const response = await request.post(`${API_URL}/auth/login`, {
    headers: {
      "Content-Type": "application/json",
      ...(await getCsrfHeaders(request)),
    },
    data: {
      email: "agent-e2e@example.test",
      password: "Agent-E2E-Password-123!",
    },
  });
  expect(response.ok()).toBe(true);
};

test.describe("UI review screenshots", () => {
  test.skip(
    !enabled,
    "Set UI_REVIEW_SCREENSHOTS=true to capture review images.",
  );

  test("captures the polished application interface", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page.request);

    const staleReviewDrawings = (await listDrawings(page.request)).filter(
      (item) =>
        item.name === "AI architecture review" ||
        item.name.startsWith("UI polish review"),
    );
    for (const stale of staleReviewDrawings) {
      await deleteDrawing(page.request, stale.id);
    }

    const drawingName = "UI polish review";
    const drawing = await createDrawing(page.request, {
      name: drawingName,
      elements: [
        {
          id: "review-original",
          type: "rectangle",
          x: 120,
          y: 120,
          width: 240,
          height: 140,
          strokeColor: "#4f46e5",
          backgroundColor: "#e0e7ff",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roughness: 1,
          opacity: 100,
          angle: 0,
          seed: 1,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
          groupIds: [],
          frameId: null,
          roundness: { type: 3 },
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
        },
      ],
    });
    await updateDrawing(page.request, drawing.id, {
      elements: [],
      version: drawing.version,
    });

    try {
      await page.goto("/");
      await expect(page.getByText(drawingName, { exact: true })).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "01-dashboard.png"),
        fullPage: true,
      });

      await page.getByRole("button", { name: "Sort drawings" }).click();
      await page.screenshot({
        path: path.join(outputDir, "02-dashboard-sort-menu.png"),
      });
      await page.keyboard.press("Escape");

      await page
        .getByText(drawingName, { exact: true })
        .click({ button: "right" });
      await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "03-drawing-context-menu.png"),
      });
      await page.keyboard.press("Escape");

      await page.goto("/settings");
      await expect(
        page.getByRole("heading", { name: "Settings" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "AI assistant" }),
      ).toBeVisible();
      await page.getByText("Advanced", { exact: true }).click();
      await expect(
        page.getByText("Legacy import", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "04-settings.png"),
        fullPage: true,
      });
      await page
        .getByText("Legacy import", { exact: true })
        .locator("xpath=../..")
        .screenshot({ path: path.join(outputDir, "04-legacy-import.png") });
      await page
        .getByRole("heading", { name: "AI assistant" })
        .locator("xpath=../..")
        .screenshot({ path: path.join(outputDir, "05-ai-settings-card.png") });

      await page.goto("/profile");
      await expect(
        page.getByRole("heading", { name: "Profile" }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "06-profile.png"),
        fullPage: true,
      });

      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "07-admin.png"),
        fullPage: true,
      });

      await page.goto(`/editor/${drawing.id}`);
      await page.waitForSelector("canvas.excalidraw__canvas.interactive", {
        timeout: 15_000,
      });
      await expect(
        page.getByRole("button", { name: "Open canvas assistant" }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "08-editor.png"),
      });

      await page.getByTitle("Version History").click();
      const historyDialog = page.getByRole("dialog", {
        name: "Version history",
      });
      await expect(historyDialog).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "09-version-history.png"),
      });
      await historyDialog.getByText(/^Version \d+$/).first().click();
      await expect(
        historyDialog.getByRole("button", { name: "Restore" }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "10-history-preview.png"),
      });
      await page.getByLabel("Close version history").click();

      await page.getByRole("button", { name: "Open canvas assistant" }).click();
      await expect(page.getByLabel("Canvas assistant")).toBeVisible();
      await expect(page.getByTestId("chatgpt-connect")).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "11-chatgpt-connect.png"),
      });

      await page.getByRole("button", { name: "Close assistant" }).click();
      await page.mouse.move(24, 2);
      await expect(page.getByTitle("Share")).toBeVisible();
      await page.getByTitle("Share").click();
      await expect(page.getByText("Agent access")).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "12-share-agent-access.png"),
      });

      await page.getByRole("button", { name: "New token" }).click();
      await expect(
        page.getByRole("button", { name: "Copy setup" }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "13-agent-token-reveal.png"),
        mask: [page.locator("code").filter({ hasText: /^exd_/ })],
      });

      await deleteDrawing(page.request, drawing.id);
      await page.request.post(`${API_URL}/auth/logout`, {
        headers: await getCsrfHeaders(page.request),
      });
      await page.goto("/login");
      await expect(
        page.getByRole("heading", { name: "Sign in to your account" }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "14-login.png"),
        fullPage: true,
      });
      await page.goto("/reset-password");
      await expect(
        page.getByRole("heading", { name: "Reset your password" }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "15-password-reset-request.png"),
        fullPage: true,
      });
      await page.goto("/reset-password-confirm#token=review-placeholder");
      await expect(
        page.getByRole("heading", { name: "Set new password" }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "16-password-reset-confirm.png"),
        fullPage: true,
      });
    } finally {
      await deleteDrawing(page.request, drawing.id).catch(() => undefined);
    }
  });
});
