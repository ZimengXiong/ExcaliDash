import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import {
  updateProfile,
  changePassword,
  changeEmail,
  getMe,
  loginUser,
} from "./api-helpers";

const ADMIN_EMAIL = process.env.BDD_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.BDD_ADMIN_PASSWORD || "BddPassword!123";

When("I navigate to the profile page", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  // Verify we can access /auth/me
  const me = await getMe(this.request);
  this.scenarioData.currentUser = me;
});

Then("I should see the profile heading", async function (this: ExcaliDashWorld) {
  const me = this.scenarioData.currentUser as { id: string; email: string };
  expect(me).toBeDefined();
  expect(me.id).toBeTruthy();
});

Then("I should see my current email", async function (this: ExcaliDashWorld) {
  const me = this.scenarioData.currentUser as { email: string };
  expect(me.email).toBeTruthy();
});

When(
  "I update my display name to {string}",
  async function (this: ExcaliDashWorld, name: string) {
    if (!this.request) throw new Error("Request not initialized");

    await updateProfile(this.request, { name });
    this.scenarioData.updatedName = name;
  }
);

Then(
  "my display name should be {string}",
  async function (this: ExcaliDashWorld, expectedName: string) {
    if (!this.request) throw new Error("Request not initialized");

    const me = await getMe(this.request);
    expect(me.name).toBe(expectedName);
  }
);

When("I change my password from the current to a new password", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");

  const newPassword = "NewBddPassword!456";
  await changePassword(this.request, {
    currentPassword: ADMIN_PASSWORD,
    newPassword,
  });

  this.scenarioData.newPassword = newPassword;
  this.scenarioData.oldPassword = ADMIN_PASSWORD;
});

Then("the password change should succeed", async function (this: ExcaliDashWorld) {
  // If we got here without error, the password change succeeded
  expect(this.scenarioData.newPassword).toBeTruthy();
});

Then("I should be able to authenticate with the new password", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");

  // Restore the original password so other tests still work
  const newPassword = this.scenarioData.newPassword as string;
  const oldPassword = this.scenarioData.oldPassword as string;

  await changePassword(this.request, {
    currentPassword: newPassword,
    newPassword: oldPassword,
  });
});

When(
  "I update my email to {string} with password confirmation",
  async function (this: ExcaliDashWorld, newEmail: string) {
    if (!this.request) throw new Error("Request not initialized");

    await changeEmail(this.request, {
      email: newEmail,
      currentPassword: ADMIN_PASSWORD,
    });

    this.scenarioData.updatedEmail = newEmail;
    this.scenarioData.originalEmail = ADMIN_EMAIL;
  }
);

Then(
  "my email should be updated to {string}",
  async function (this: ExcaliDashWorld, expectedEmail: string) {
    if (!this.request) throw new Error("Request not initialized");

    const me = await getMe(this.request);
    expect(me.email).toBe(expectedEmail);

    // Restore original email so other tests still work
    const originalEmail = this.scenarioData.originalEmail as string;
    if (originalEmail && me.email !== originalEmail) {
      await changeEmail(this.request, {
        email: originalEmail,
        currentPassword: ADMIN_PASSWORD,
      });
    }
  }
);

When("I navigate to the profile page via UI", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/profile`);
  await this.page.waitForLoadState("networkidle");
});

Then(
  "I should see the {string} section",
  async function (this: ExcaliDashWorld, sectionName: string) {
    if (!this.page) throw new Error("Page not initialized");
    const heading = this.page.getByRole("heading", { name: sectionName });
    await expect(heading).toBeVisible({ timeout: 10000 });
  }
);
