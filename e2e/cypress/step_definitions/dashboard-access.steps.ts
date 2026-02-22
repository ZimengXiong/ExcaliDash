import { Given } from "@badeball/cypress-cucumber-preprocessor";
import { waitForDashboard } from "./ui-helpers";

Given("the dashboard is open", () => {
  cy.visit("/");
  waitForDashboard();
});
