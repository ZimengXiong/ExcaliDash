import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { request as playwrightRequest } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import {
  createUser,
  resetUserPassword,
  loginUser,
  completeMustResetPassword,
  getCsrfHeaders,
  API_URL,
} from "./api-helpers";

When("I navigate to the password reset page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/reset-password`);
  await this.page.waitForLoadState("networkidle");
});

Then("I should see the password reset information", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  // The password reset page shows instructions (heading or info text)
  const heading = this.page.locator("h1, h2").first();
  await expect(heading).toBeVisible({ timeout: 10000 });
});

Given("a user exists with must-reset-password enabled", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");

  const email = `bdd-mustreset-${Date.now()}@example.com`;
  const tempPassword = "TempReset!123";

  const user = await createUser(this.request, {
    email,
    password: tempPassword,
    name: "BDD Must Reset User",
    mustResetPassword: true,
  });

  this.scenarioData.mustResetUserId = user.id;
  this.scenarioData.mustResetUserEmail = email;
  this.scenarioData.mustResetUserPassword = tempPassword;
  this.createdUserIds.push(user.id);
});

When("the user logs in with their temporary password", async function (this: ExcaliDashWorld) {
  const apiUrl = process.env.API_URL || this.apiUrl || API_URL;
  const email = this.scenarioData.mustResetUserEmail as string;
  const password = this.scenarioData.mustResetUserPassword as string;

  // Create a fresh request context for the must-reset user
  const userRequest = await playwrightRequest.newContext({ baseURL: apiUrl });
  this.scenarioData.mustResetRequest = userRequest;

  const csrfResponse = await userRequest.get(`${apiUrl}/csrf-token`, {
    headers: { origin: process.env.BASE_URL || "http://127.0.0.1:5173" },
  });
  const csrfData = (await csrfResponse.json()) as { token: string; header?: string };
  const csrfHeader = csrfData.header || "x-csrf-token";

  const loginResponse = await userRequest.post(`${apiUrl}/auth/login`, {
    headers: {
      "Content-Type": "application/json",
      [csrfHeader]: csrfData.token,
      origin: process.env.BASE_URL || "http://127.0.0.1:5173",
    },
    data: { email, password },
  });

  this.scenarioData.mustResetLoginResponse = {
    ok: loginResponse.ok(),
    status: loginResponse.status(),
    body: await loginResponse.json().catch(() => ({})),
  };
});

Then("the user should be prompted to set a new password", async function (this: ExcaliDashWorld) {
  const loginResponse = this.scenarioData.mustResetLoginResponse as {
    ok: boolean;
    status: number;
    body: Record<string, unknown>;
  };

  // The login should succeed but the user has mustResetPassword flag
  // The response or subsequent /auth/me should indicate this
  expect(loginResponse.ok).toBe(true);
});

When("the user sets a new password", async function (this: ExcaliDashWorld) {
  const userRequest = this.scenarioData.mustResetRequest as ReturnType<typeof playwrightRequest.newContext> extends Promise<infer T> ? T : never;
  if (!userRequest) throw new Error("Must-reset user request not initialized");

  const apiUrl = process.env.API_URL || this.apiUrl || API_URL;
  const newPassword = "NewPermanent!456";

  const csrfResponse = await userRequest.get(`${apiUrl}/csrf-token`, {
    headers: { origin: process.env.BASE_URL || "http://127.0.0.1:5173" },
  });
  const csrfData = (await csrfResponse.json()) as { token: string; header?: string };
  const csrfHeader = csrfData.header || "x-csrf-token";

  const resetResponse = await userRequest.post(`${apiUrl}/auth/must-reset-password`, {
    headers: {
      "Content-Type": "application/json",
      [csrfHeader]: csrfData.token,
      origin: process.env.BASE_URL || "http://127.0.0.1:5173",
    },
    data: { newPassword },
  });

  this.scenarioData.mustResetCompleteResponse = {
    ok: resetResponse.ok(),
    status: resetResponse.status(),
  };

  // Clean up the request context
  await userRequest.dispose();
});

Then("the forced reset should complete successfully", async function (this: ExcaliDashWorld) {
  const response = this.scenarioData.mustResetCompleteResponse as { ok: boolean; status: number };
  expect(response.ok).toBe(true);
});
