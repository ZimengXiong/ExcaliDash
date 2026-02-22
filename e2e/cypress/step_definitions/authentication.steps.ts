import { When, Then } from "@badeball/cypress-cucumber-preprocessor";
import { getScenario, setScenario, createdUserIds } from "./shared-context";
import { getCsrfInfo, listUsers, updateUserRole } from "./api-helpers";
import { waitForDashboard } from "./ui-helpers";

const resolveApiUrl = () => Cypress.env("apiUrl") || "http://127.0.0.1:8000";
const resolveBaseUrl = () => Cypress.config("baseUrl") || "http://127.0.0.1:5173";

When("I check the auth status", () => {
  cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    cy.request({ url: `${resolveApiUrl()}/auth/status`, headers: { Cookie: cookie } }).then(
      (response) => {
        setScenario("authStatusResponse", response);
      }
    );
  });
});

Then("authentication should be enabled", () => {
  const response = getScenario<Cypress.Response<any>>("authStatusResponse");
  expect(response.status).to.eq(200);
  expect(response.body.enabled).to.eq(true);
});

When("I create a standard user", () => {
  const email = `bdd_user_${Date.now()}@example.com`;
  return cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    return getCsrfInfo().then((csrf) =>
      cy
        .request({
          method: "POST",
          url: `${resolveApiUrl()}/auth/users`,
          headers: {
            origin: resolveBaseUrl(),
            [csrf.header]: csrf.token,
            Cookie: cookie,
          },
          body: {
            email,
            name: "BDD User",
            password: "BddPassword!123",
            role: "USER",
            mustResetPassword: false,
            isActive: true,
          },
        })
        .then((response) => {
          expect(response.status).to.eq(201);
          const user = response.body.user || response.body;
          setScenario("createdUserEmail", email);
          setScenario("createdUserId", user.id);
          if (!createdUserIds.includes(user.id)) {
            createdUserIds.push(user.id);
          }
        })
    );
  });
});

When("I promote the user to admin", () => {
  const identifier = getScenario<string>("createdUserEmail");
  return updateUserRole(identifier, "ADMIN").then((updated) => {
    setScenario("updatedUser", updated);
  });
});

Then("the user role should be admin", () => {
  const identifier = getScenario<string>("createdUserEmail");
  return listUsers().then((users) => {
    const user = users.find((u) => u.email === identifier);
    expect(user?.role).to.eq("ADMIN");
  });
});

When("I demote the user to standard", () => {
  const identifier = getScenario<string>("createdUserEmail");
  return updateUserRole(identifier, "USER").then((updated) => {
    setScenario("updatedUser", updated);
  });
});

Then("the user role should be standard", () => {
  const identifier = getScenario<string>("createdUserEmail");
  return listUsers().then((users) => {
    const user = users.find((u) => u.email === identifier);
    expect(user?.role).to.eq("USER");
  });
});

When("I logout from the app", () => {
  cy.visit("/");
  waitForDashboard();
  cy.get("body").then(($body) => {
    const openMenu = $body.find('button[aria-label="Open menu"]');
    if (openMenu.length > 0) {
      cy.wrap(openMenu).first().click();
    }
  });
  cy.contains("button", /Logout/i)
    .scrollIntoView()
    .should("be.visible")
    .click();
});

// "I should be on the login page" is defined in shared-assertions.steps.ts
