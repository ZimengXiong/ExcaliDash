import { When, Then } from "@badeball/cypress-cucumber-preprocessor";
import { setScenario, getScenario } from "./shared-context";

const resolveApiUrl = () => Cypress.env("apiUrl") || "http://127.0.0.1:8000";

When("I check the health endpoint", () => {
  cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    cy.request({ url: `${resolveApiUrl()}/health`, headers: { Cookie: cookie } }).then(
      (response) => {
        setScenario("healthResponse", response);
      }
    );
  });
});

Then("the service should report healthy", () => {
  const response = getScenario<Cypress.Response<any>>("healthResponse");
  expect(response.status).to.eq(200);
});
