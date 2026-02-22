import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";

When("I export the drawing from the editor toolbar", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await this.page.goto(`${this.baseUrl}/editor/${drawingId}`);
  await this.page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  const exportButton = this.page.getByTitle("Export drawing");
  await exportButton.click();
});

Then("the editor export should show success", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await expect(this.page.getByText("Drawing exported")).toBeVisible();
});
