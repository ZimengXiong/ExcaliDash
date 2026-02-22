import { When, Then } from "@badeball/cypress-cucumber-preprocessor";
import { getScenario } from "./shared-context";

When("I export the drawing from the editor toolbar", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit(`/editor/${drawingId}`);
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
  // Move mouse to top of page to trigger header visibility
  cy.get("canvas.excalidraw__canvas.interactive").trigger("mousemove", { clientX: 400, clientY: 10 });
  cy.get('[title="Export drawing"]').should("exist").click({ force: true });
});

Then("the editor export should show success", () => {
  cy.contains("Drawing exported").should("be.visible");
});
