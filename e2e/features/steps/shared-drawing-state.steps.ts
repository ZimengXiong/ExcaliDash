import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getDrawing } from "./api-helpers";

Then("the drawing should contain at least {int} element", async function (this: ExcaliDashWorld, count: number) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await expect.poll(async () => {
    const savedDrawing = await getDrawing(this.request!, drawingId);
    return savedDrawing.elements?.length || 0;
  }, { timeout: 90000 }).toBeGreaterThanOrEqual(count);
});
