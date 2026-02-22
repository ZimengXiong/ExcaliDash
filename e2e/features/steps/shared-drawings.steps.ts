import { Given } from "@cucumber/cucumber";
import type { ExcaliDashWorld } from "../support/world";
import { createDrawing } from "./api-helpers";

Given("drawings with names:", async function (this: ExcaliDashWorld, table) {
  if (!this.request) throw new Error("Request not initialized");
  const entries = table.hashes();
  for (const entry of entries) {
    const drawing = await createDrawing(this.request, { name: entry.name });
    this.createdDrawingIds.push(drawing.id);
  }
  this.scenarioData.drawingPrefix = entries[0]?.name?.split(" ")[0] || "";
});
