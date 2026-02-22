import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import {
  createUser,
  listUsers,
  patchUser,
  resetUserPassword,
  toggleRegistration,
  getLoginRateLimit,
  updateLoginRateLimit,
  startImpersonation,
  stopImpersonation,
  getMe,
  getAuthStatus,
} from "./api-helpers";

When("I navigate to the admin page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/admin`);
  await this.page.waitForLoadState("networkidle");
});

Then("I should see the admin heading", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const heading = this.page.getByRole("heading", { name: "Admin" });
  await expect(heading).toBeVisible({ timeout: 10000 });
});

Then("I should see the users table", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  // The admin page has a "Users" heading and a table-like list of users
  const usersHeading = this.page.getByRole("heading", { name: "Users" });
  await expect(usersHeading).toBeVisible({ timeout: 10000 });
});

When(
  "I create a user with email {string} and name {string}",
  async function (this: ExcaliDashWorld, email: string, name: string) {
    if (!this.request) throw new Error("Request not initialized");

    const user = await createUser(this.request, {
      email,
      password: "TempPass!123",
      name,
    });
    this.scenarioData.createdUserId = user.id;
    this.scenarioData.createdUserEmail = email;
    this.createdUserIds.push(user.id);
  }
);

Then(
  "the user {string} should appear in the user list",
  async function (this: ExcaliDashWorld, email: string) {
    if (!this.request) throw new Error("Request not initialized");

    const users = await listUsers(this.request);
    const found = users.find((u) => u.email === email);
    expect(found).toBeDefined();
  }
);

Given(
  "a user exists with email {string}",
  async function (this: ExcaliDashWorld, email: string) {
    if (!this.request) throw new Error("Request not initialized");

    // Check if user already exists
    const users = await listUsers(this.request);
    const existing = users.find((u) => u.email === email);
    if (existing) {
      this.scenarioData.targetUserId = existing.id;
      this.scenarioData.targetUserEmail = email;
      return;
    }

    const user = await createUser(this.request, {
      email,
      password: "TempPass!123",
      name: `BDD User ${Date.now()}`,
    });
    this.scenarioData.targetUserId = user.id;
    this.scenarioData.targetUserEmail = email;
    this.createdUserIds.push(user.id);
  }
);

When(
  "I update the user name to {string}",
  async function (this: ExcaliDashWorld, name: string) {
    if (!this.request) throw new Error("Request not initialized");
    const userId = this.scenarioData.targetUserId as string;

    await patchUser(this.request, userId, { name });
    this.scenarioData.updatedUserName = name;
  }
);

Then(
  "the user should have name {string}",
  async function (this: ExcaliDashWorld, expectedName: string) {
    if (!this.request) throw new Error("Request not initialized");
    const userId = this.scenarioData.targetUserId as string;

    const users = await listUsers(this.request);
    const user = users.find((u) => u.id === userId);
    expect(user).toBeDefined();
    expect(user!.name).toBe(expectedName);
  }
);

When("I deactivate the user", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const userId = this.scenarioData.targetUserId as string;
  await patchUser(this.request, userId, { isActive: false });
});

Then("the user should be inactive", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const userId = this.scenarioData.targetUserId as string;

  const users = await listUsers(this.request);
  const user = users.find((u) => u.id === userId);
  expect(user).toBeDefined();
  expect(user!.isActive).toBe(false);
});

When("I reactivate the user", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const userId = this.scenarioData.targetUserId as string;
  await patchUser(this.request, userId, { isActive: true });
});

Then("the user should be active", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const userId = this.scenarioData.targetUserId as string;

  const users = await listUsers(this.request);
  const user = users.find((u) => u.id === userId);
  expect(user).toBeDefined();
  expect(user!.isActive).toBe(true);
});

When("I set the must-reset-password flag on the user", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const userId = this.scenarioData.targetUserId as string;
  await patchUser(this.request, userId, { mustResetPassword: true });
});

Then("the user should have must-reset-password enabled", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const userId = this.scenarioData.targetUserId as string;

  const users = await listUsers(this.request);
  const user = users.find((u) => u.id === userId);
  expect(user).toBeDefined();
  expect(user!.mustResetPassword).toBe(true);
});

When("I force-reset the user password", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const userId = this.scenarioData.targetUserId as string;

  const result = await resetUserPassword(this.request, userId);
  this.scenarioData.temporaryPassword = result.temporaryPassword;
});

Then("a temporary password should be returned", async function (this: ExcaliDashWorld) {
  const tempPassword = this.scenarioData.temporaryPassword as string;
  expect(tempPassword).toBeDefined();
  expect(tempPassword.length).toBeGreaterThan(0);
});

When("I disable user registration", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  await toggleRegistration(this.request, false);
});

Then("registration should be disabled", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const status = await getAuthStatus(this.request);
  expect(status.registrationEnabled).toBe(false);
});

When("I enable user registration", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  await toggleRegistration(this.request, true);
});

Then("registration should be enabled", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const status = await getAuthStatus(this.request);
  expect(status.registrationEnabled).toBe(true);
});

When("I request the login rate-limit config", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const config = await getLoginRateLimit(this.request);
  this.scenarioData.rateLimitConfig = config;
});

Then("the rate-limit config should contain window and max values", async function (this: ExcaliDashWorld) {
  const config = this.scenarioData.rateLimitConfig as { windowMs: number; max: number };
  expect(typeof config.windowMs).toBe("number");
  expect(typeof config.max).toBe("number");
});

When(
  "I update the login rate-limit to {int} requests per {int} ms",
  async function (this: ExcaliDashWorld, maxRequests: number, windowMs: number) {
    if (!this.request) throw new Error("Request not initialized");
    const result = await updateLoginRateLimit(this.request, {
      max: maxRequests,
      windowMs,
    });
    this.scenarioData.updatedRateLimitConfig = result;
  }
);

Then("the rate-limit config should reflect the new values", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const config = await getLoginRateLimit(this.request);
  expect(config.max).toBe(10);
  expect(config.windowMs).toBe(60000);
});

When("I start impersonating the user", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const userId = this.scenarioData.targetUserId as string;
  await startImpersonation(this.request, userId);
});

Then("the auth session should reflect the impersonated user", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const targetUserId = this.scenarioData.targetUserId as string;

  const me = await getMe(this.request);
  expect(me.id).toBe(targetUserId);
});

Given("I am impersonating the user", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const userId = this.scenarioData.targetUserId as string;
  await startImpersonation(this.request, userId);
});

When("I stop impersonating", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  await stopImpersonation(this.request);
});

Then("the auth session should reflect the admin user", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");

  const me = await getMe(this.request);
  expect(me.role).toBe("ADMIN");
});
