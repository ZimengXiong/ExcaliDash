import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getDrawing } from "./api-helpers";
import { applyDashboardSearch } from "./ui-helpers";

Then("the first drawing should be {string}", async function (this: ExcaliDashWorld, name: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const searchTerm = name.split(" ")[0];
  await applyDashboardSearch(this.page, searchTerm);
  const cards = this.page.locator("[id^='drawing-card-']");
  await expect(cards.first()).toBeVisible();
  const firstId = await cards.first().getAttribute("id");
  if (!firstId) throw new Error("First card not found");
  const drawingId = firstId.replace("drawing-card-", "");
  const drawing = await getDrawing(this.request, drawingId);
  expect(drawing.name).toBe(name);
});
