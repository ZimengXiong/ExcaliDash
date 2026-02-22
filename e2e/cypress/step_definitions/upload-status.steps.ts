import { When } from "@badeball/cypress-cucumber-preprocessor";

When("I wait for uploads to finish", () => {
  // Wait a moment for any upload to start, then check if the upload indicator exists
  cy.wait(1000);
  cy.get("body").then(($body) => {
    if ($body.find(":contains('Uploads (')").length > 0) {
      cy.contains(/Uploads \(/i).click({ force: true });
      cy.contains(/Uploads \(Done\)|Uploads \(\d+ active\)/i, { timeout: 30000 }).should("exist");
    }
    // If no upload indicator, uploads completed (or there were none)
  });
});
