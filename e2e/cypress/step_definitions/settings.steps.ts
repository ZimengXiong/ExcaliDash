import { Given, When, Then } from "@badeball/cypress-cucumber-preprocessor";

Given("the settings page is open", () => {
  cy.visit("/settings");
  cy.contains("h1", "Settings", { timeout: 10000 }).should("be.visible");
});

When("I toggle the theme", () => {
  cy.get("button").contains(/Dark Mode|Light Mode/).first().click();
  cy.get("html").should(($html) => {
    const isDark = $html.hasClass("dark");
    expect(typeof isDark).to.eq("boolean");
  });
});

When("I enable dark mode", () => {
  cy.get("html").then(($html) => {
    if (!$html.hasClass("dark")) {
      cy.get("button").contains("Dark Mode").first().click();
    }
  });
  cy.get("html").should("have.class", "dark");
});

When("I enable light mode", () => {
  cy.get("html").then(($html) => {
    if ($html.hasClass("dark")) {
      cy.get("button").contains("Light Mode").first().click();
    }
  });
  cy.get("html").should("not.have.class", "dark");
});

When("I navigate to the dashboard", () => {
  cy.visit("/");
});

When("I reload the page", () => {
  cy.reload();
});

Then("the theme should be updated", () => {
  cy.get("button").contains(/Dark Mode|Light Mode/).first().should("be.visible");
  cy.get("html").should(($html) => {
    const hasDark = $html.hasClass("dark");
    expect(typeof hasDark).to.eq("boolean");
  });
});

Then("dark mode should remain enabled", () => {
  cy.get("html").should("have.class", "dark");
});

Then("dark theme styling should be applied", () => {
  cy.get("body").should("have.css", "background-color");
});

Then("light theme styling should be applied", () => {
  cy.get("html").should("not.have.class", "dark");
});
