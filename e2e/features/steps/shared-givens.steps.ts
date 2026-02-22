import { Given } from "@cucumber/cucumber";
import type { ExcaliDashWorld } from "../support/world";
import { createCollection, createDrawing } from "./api-helpers";

Given("a collection named {string}", async function (this: ExcaliDashWorld, name: string) {
  if (!this.request) throw new Error("Request not initialized");
  const collection = await createCollection(this.request, name);
  this.createdCollectionIds.push(collection.id);
  this.scenarioData.collectionId = collection.id;
  this.scenarioData.collectionName = name;
});

Given(/a drawing (?:exists named|named .* exists|named) "([^"]+)"/, async function (this: ExcaliDashWorld, name: string) {
  if (!this.request) throw new Error("Request not initialized");
  const drawing = await createDrawing(this.request, { name });
  this.createdDrawingIds.push(drawing.id);
  this.scenarioData.drawingId = drawing.id;
  this.scenarioData.drawingName = name;
});

Given("drawings exist", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const seed = Date.now();
  const names = [`BDD Select ${seed} A`, `BDD Select ${seed} B`];
  for (const name of names) {
    const drawing = await createDrawing(this.request, { name });
    this.createdDrawingIds.push(drawing.id);
  }
});
