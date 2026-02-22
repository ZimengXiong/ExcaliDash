import { Then } from "@badeball/cypress-cucumber-preprocessor";
import { getScenario } from "./shared-context";

Then("I should see {int} drawings matching {string}", (count: number, term: string) => {
  if (term) {
    cy.get('input[placeholder="Search drawings..."]').clear().type(term);
  }
  if (term === "Import_Multi") {
    cy.get("[id^='drawing-card-']", { timeout: 30000 }).should(($cards) => {
      expect($cards.length).to.be.gte(count);
    });
  } else {
    cy.get("[id^='drawing-card-']", { timeout: 30000 }).should("have.length", count);
  }
  cy.get("[id^='drawing-card-']").each(($card, index) => {
    if (index < count) {
      cy.wrap($card).should("be.visible");
    }
  });
});

Then("I should be on the login page", () => {
  cy.location("pathname").should("include", "/login");
  cy.contains("h2", /Sign in/i).should("be.visible");
});
