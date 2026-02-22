import { Given } from "@badeball/cypress-cucumber-preprocessor";
import { createCollection, createDrawing } from "./api-helpers";
import { createdCollectionIds, createdDrawingIds, setScenario } from "./shared-context";

Given("a collection named {string}", (name: string) => {
  return createCollection(name).then((collection) => {
    createdCollectionIds.push(collection.id);
    setScenario("collectionId", collection.id);
    setScenario("collectionName", name);
  });
});

Given(/a drawing (?:exists named|named .* exists|named) "([^"]+)"/, (name: string) => {
  return createDrawing({ name }).then((drawing) => {
    createdDrawingIds.push(drawing.id);
    setScenario("drawingId", drawing.id);
    setScenario("drawingName", name);
  });
});

Given("drawings exist", () => {
  const seed = Date.now();
  const names = [`BDD Select ${seed} A`, `BDD Select ${seed} B`];
  return Cypress.Promise.all(
    names.map((name) =>
      createDrawing({ name }).then((drawing) => {
        createdDrawingIds.push(drawing.id);
      })
    )
  );
});
