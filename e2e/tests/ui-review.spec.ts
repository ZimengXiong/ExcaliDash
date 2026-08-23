import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  API_URL,
  createDrawing,
  deleteDrawing,
  getCsrfHeaders,
} from "./helpers/api";

const enabled = process.env.UI_REVIEW_SCREENSHOTS === "true";
const outputDir = process.env.UI_REVIEW_OUTPUT
  ? path.resolve(process.env.UI_REVIEW_OUTPUT)
  : path.resolve("test-results/ui-review");

const login = async (
  request: import("@playwright/test").APIRequestContext,
) => {
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
  test.skip(!enabled, "Set UI_REVIEW_SCREENSHOTS=true to capture review images.");

  test("captures every restored UI", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page.request);

    const drawing = await createDrawing(page.request, {
      name: "AI architecture review",
      elements: [],
    });

    try {
      await page.goto("/admin");
      await expect(page.getByRole("heading", { name: "AI Assistant" })).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "01-admin-settings.png"),
        fullPage: true,
      });
      await page
        .getByRole("heading", { name: "AI Assistant" })
        .locator("xpath=../../..")
        .screenshot({ path: path.join(outputDir, "02-ai-settings-card.png") });

      await page.goto(`/editor/${drawing.id}`);
      await page.waitForSelector("canvas.excalidraw__canvas.interactive", {
        timeout: 15_000,
      });
      await expect(
        page.getByRole("button", { name: "Open canvas assistant" }),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "03-editor-assistant-launcher.png"),
      });

      await page
        .getByRole("button", { name: "Open canvas assistant" })
        .click();
      await expect(page.getByLabel("Canvas assistant")).toBeVisible();
      await expect(page.getByTestId("chatgpt-connect")).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "04-chatgpt-connect.png"),
      });

      await page.getByRole("button", { name: "Close assistant" }).click();
      await page.mouse.move(24, 2);
      await expect(page.getByTitle("Share")).toBeVisible();
      await page.getByTitle("Share").click();
      await expect(page.getByText("Agent access")).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "05-share-agent-access.png"),
      });

      await page.getByRole("button", { name: "New token" }).click();
      await expect(page.getByText("Copy now — shown only once")).toBeVisible();
      await page.screenshot({
        path: path.join(outputDir, "06-agent-token-reveal.png"),
      });
    } finally {
      await deleteDrawing(page.request, drawing.id).catch(() => undefined);
    }
  });
});
