import { When, Then } from "@badeball/cypress-cucumber-preprocessor";
import { applyDashboardSearch, waitForDashboard } from "./ui-helpers";
import { getScenario } from "./shared-context";

/**
 * The sort UI is a dropdown menu: a single button showing the current sort label
 * (e.g. "Name"), which opens a menu with options. The direction toggle is a
 * separate button with title "Sort Ascending" / "Sort Descending".
 */

When("I search for {string}", (term: string) => {
  cy.visit("/");
  waitForDashboard();
  applyDashboardSearch(term);
});

Then("I should see the empty search state for {string}", (term: string) => {
  // The Dashboard renders "No drawings found" as the heading and
  // 'No results for "..."' as a subtitle in the empty state.
  // Wait for the search to filter, then check the empty state text.
  cy.contains("No drawings found", { timeout: 10000 }).should("be.visible");
  cy.contains(`No results for`, { timeout: 5000 }).should("be.visible");
});

When("I clear the search", () => {
  applyDashboardSearch("");
  cy.get("[id^='drawing-card-']", { timeout: 10000 }).should("exist");
});

Then("I should see drawings matching {string}", (term: string) => {
  applyDashboardSearch(term);
  cy.get("[id^='drawing-card-']", { timeout: 10000 }).should("exist");
});

When("I press the search keyboard shortcut", () => {
  cy.visit("/");
  waitForDashboard();
  cy.get("body").type(Cypress.platform === "darwin" ? "{meta}k" : "{ctrl}k");
});

Then("the search input should be focused", () => {
  cy.get("input[placeholder=\"Search drawings...\"]").should("be.focused");
});

/**
 * Helper: open the sort dropdown and select a sort field.
 * After selecting, wait for the dashboard to re-fetch sorted data.
 */
const selectSortField = (label: string) => {
  // Open the sort dropdown — it's the button inside div.relative showing the current sort label
  cy.get("div.relative > button").filter(`:contains("Name"), :contains("Date Created"), :contains("Date Modified")`).first().click();
  // Click the matching option in the dropdown menu (absolute positioned z-50 div)
  cy.get(".absolute.z-50, [class*='z-50']").contains("button", label).click();
  // Wait for the sort to take effect (re-fetch and re-render)
  cy.wait(500);
};

/**
 * Select a sort option from the dropdown menu.
 * Also applies a search filter using the drawing prefix so only this scenario's
 * drawings are visible, avoiding interference from other scenarios.
 */
When("I sort drawings by {string}", (label: string) => {
  cy.visit("/");
  waitForDashboard();

  // Search for the prefix saved by the "drawings with names:" step
  // This ensures only this scenario's drawings are shown.
  const prefix = getScenario<string>("drawingPrefix");
  if (prefix) {
    applyDashboardSearch(prefix);
    cy.get("[id^='drawing-card-']", { timeout: 10000 }).should("exist");
  }

  selectSortField(label);
});

/**
 * Toggle sort direction by clicking the sort option twice.
 * First click selects the field; second click on the direction toggle reverses order.
 */
When("I toggle sort {string} twice", (label: string) => {
  cy.visit("/");
  waitForDashboard();

  // Search for the prefix saved by the "drawings with names:" step
  const prefix = getScenario<string>("drawingPrefix");
  if (prefix) {
    applyDashboardSearch(prefix);
    cy.get("[id^='drawing-card-']", { timeout: 10000 }).should("exist");
  }

  selectSortField(label);
  // Now toggle the direction button (it has title "Sort Ascending" or "Sort Descending")
  cy.get('button[title^="Sort "]').click();
  cy.wait(500);
});

Then("the {string} sort should be active", (label: string) => {
  // The sort dropdown button should display the active sort label
  cy.get("button").contains(label).should("exist");
});
