import { Given } from "@badeball/cypress-cucumber-preprocessor";
import { createDrawing } from "./api-helpers";
import { createdDrawingIds, setScenario } from "./shared-context";

Given("drawings with names:", (table: { hashes: () => Array<{ name: string }> }) => {
  const entries = table.hashes();
  const promises = entries.map((entry) =>
    createDrawing({ name: entry.name }).then((drawing) => {
      createdDrawingIds.push(drawing.id);
    })
  );
  const prefix = entries[0]?.name?.split(" ")[0] || "";
  setScenario("drawingPrefix", prefix);
  // Also store the IDs created in this step so assertions can filter by them
  setScenario("createdInStep", true);
  return Cypress.Promise.all(promises);
});
