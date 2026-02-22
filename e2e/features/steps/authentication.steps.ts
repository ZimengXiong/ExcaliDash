import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getCsrfHeaders, listUsers, updateUserRole } from "./api-helpers";

const resolveApiUrl = (world: ExcaliDashWorld) => world.apiUrl.replace(/\/$/, "");

When("I check the auth status", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  this.scenarioData.authStatusResponse = await this.request.get(`${resolveApiUrl(this)}/auth/status`);
});

Then("authentication should be enabled", async function (this: ExcaliDashWorld) {
  const response = this.scenarioData.authStatusResponse as Awaited<ReturnType<NonNullable<ExcaliDashWorld["request"]>["get"]>>;
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.enabled).toBe(true);
});

When("I create a standard user", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const email = `bdd_user_${Date.now()}@example.com`;
  const response = await this.request.post(`${resolveApiUrl(this)}/auth/users`, {
    headers: {
      "Content-Type": "application/json",
      ...(await getCsrfHeaders(this.request)),
    },
    data: {
      email,
      name: "BDD User",
      password: "BddPassword!123",
      role: "USER",
      mustResetPassword: false,
      isActive: true,
    },
  });
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  const user = payload.user || payload;
  this.scenarioData.createdUserEmail = email;
  this.scenarioData.createdUserId = user.id;
  if (!this.createdUserIds.includes(user.id)) {
    this.createdUserIds.push(user.id);
  }
});

When("I promote the user to admin", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const identifier = this.scenarioData.createdUserEmail as string;
  const updated = await updateUserRole(this.request, identifier, "ADMIN");
  this.scenarioData.updatedUser = updated;
});

Then("the user role should be admin", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const identifier = this.scenarioData.createdUserEmail as string;
  const users = await listUsers(this.request);
  const user = users.find((u) => u.email === identifier);
  expect(user?.role).toBe("ADMIN");
});

When("I demote the user to standard", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const identifier = this.scenarioData.createdUserEmail as string;
  const updated = await updateUserRole(this.request, identifier, "USER");
  this.scenarioData.updatedUser = updated;
});

Then("the user role should be standard", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const identifier = this.scenarioData.createdUserEmail as string;
  const users = await listUsers(this.request);
  const user = users.find((u) => u.email === identifier);
  expect(user?.role).toBe("USER");
});

When("I logout from the app", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");

  const isMobile = await this.page.evaluate(() => window.matchMedia("(max-width: 1024px)").matches);
  if (isMobile) {
    const menuButton = this.page.getByRole("button", { name: /open menu|close menu/i });
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }
  }

  const logoutButton = this.page.getByRole("button", { name: "Logout" });
  await expect(logoutButton).toBeVisible({ timeout: 10000 });
  await logoutButton.click();
});
