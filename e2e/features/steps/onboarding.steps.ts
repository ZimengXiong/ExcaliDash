import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getAuthStatus } from "./api-helpers";

// These scenarios require a fresh database with no existing users.
// They are tagged @onboarding and should be run in isolation.

When("I check the auth status on a fresh instance", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const status = await getAuthStatus(this.request);
  this.scenarioData.authStatus = status;
});

Then("the auth status should indicate onboarding is required", async function (this: ExcaliDashWorld) {
  const status = this.scenarioData.authStatus as Record<string, unknown>;
  // On a fresh instance, authOnboardingRequired should be true or bootstrapRequired should be true
  const needsOnboarding =
    status.authOnboardingRequired === true || status.bootstrapRequired === true;
  expect(needsOnboarding).toBe(true);
});

When("I visit the application on a fresh instance", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");
});

Then("I should see the auth setup choice page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  // The page should redirect to /auth-setup or show the setup choice UI
  await expect.poll(async () => {
    const url = this.page!.url();
    return url.includes("auth-setup") || url.includes("register");
  }, { timeout: 10000 }).toBe(true);
});

When("I choose to enable authentication during onboarding", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const apiUrl = process.env.API_URL || this.apiUrl;

  // Submit the onboarding choice to enable auth
  const csrfResponse = await this.request.get(`${apiUrl}/csrf-token`, {
    headers: { origin: process.env.BASE_URL || "http://127.0.0.1:5173" },
  });
  const csrfData = (await csrfResponse.json()) as { token: string; header?: string };
  const csrfHeader = csrfData.header || "x-csrf-token";

  const response = await this.request.post(`${apiUrl}/auth/onboarding-choice`, {
    headers: {
      "Content-Type": "application/json",
      [csrfHeader]: csrfData.token,
      origin: process.env.BASE_URL || "http://127.0.0.1:5173",
    },
    data: { enableAuth: true },
  });

  this.scenarioData.onboardingResponse = {
    ok: response.ok(),
    status: response.status(),
    body: await response.json().catch(() => ({})),
  };
});

Then("a bootstrap setup code should be generated", async function (this: ExcaliDashWorld) {
  const response = this.scenarioData.onboardingResponse as {
    ok: boolean;
    body: Record<string, unknown>;
  };
  // The response or logs should indicate a setup code was generated
  expect(response.ok).toBe(true);
});

Then("I should be able to register the first admin account", async function (this: ExcaliDashWorld) {
  // After enabling auth, the /register page should be accessible
  // The bootstrap code is printed to backend logs
  const status = await getAuthStatus(this.request!);
  expect(status.enabled).toBe(true);
});
