import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getCsrfHeaders } from "./api-helpers";

const ADMIN_EMAIL = process.env.BDD_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.BDD_ADMIN_PASSWORD || "BddPassword!123";

When("I navigate to the login page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/login`);
  await this.page.waitForLoadState("networkidle");
});

Then("I should see the sign-in heading", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const heading = this.page.getByRole("heading", { name: /Sign in/i });
  await expect(heading).toBeVisible({ timeout: 10000 });
});

Then("I should see the email input", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const emailInput = this.page.locator("input#email, input[type='email']").first();
  await expect(emailInput).toBeVisible({ timeout: 10000 });
});

Then("I should see the password input", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const passwordInput = this.page.locator("input#password, input[type='password']").first();
  await expect(passwordInput).toBeVisible({ timeout: 10000 });
});

Then("I should see the sign-in button", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const signInButton = this.page.getByRole("button", { name: /Sign in/i });
  await expect(signInButton).toBeVisible({ timeout: 10000 });
});

When("I log out from the application", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");

  // Navigate to dashboard first
  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");

  // Click the logout button in the sidebar (or mobile menu)
  const logoutButton = this.page.getByRole("button", { name: /Logout/i });
  const hamburger = this.page.locator("button.md\\:hidden, [aria-label='Open menu']").first();

  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
    await this.page.waitForTimeout(500);
  }

  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click();
    await this.page.waitForURL(/\/login/, { timeout: 10000 });
  }
});

When("I submit valid credentials on the login page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");

  await this.page.goto(`${this.baseUrl}/login`);
  await this.page.waitForLoadState("networkidle");

  const emailInput = this.page.locator("input#email, input[type='email']").first();
  const passwordInput = this.page.locator("input#password, input[type='password']").first();

  await emailInput.fill(ADMIN_EMAIL);
  await passwordInput.fill(ADMIN_PASSWORD);

  const signInButton = this.page.getByRole("button", { name: /Sign in/i });
  await signInButton.click();
});

Then("I should be redirected to the dashboard", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  // Wait for redirect to dashboard (URL should be / or not contain /login)
  await expect.poll(
    async () => {
      const url = this.page!.url();
      return !url.includes("/login");
    },
    { timeout: 15000 }
  ).toBe(true);
});

When("I submit invalid credentials on the login page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");

  await this.page.goto(`${this.baseUrl}/login`);
  await this.page.waitForLoadState("networkidle");

  const emailInput = this.page.locator("input#email, input[type='email']").first();
  const passwordInput = this.page.locator("input#password, input[type='password']").first();

  await emailInput.fill("invalid@example.com");
  await passwordInput.fill("WrongPassword!123");

  const signInButton = this.page.getByRole("button", { name: /Sign in/i });
  await signInButton.click();

  // Wait a moment for error to appear
  await this.page.waitForTimeout(2000);
});

Then("I should see a login error message", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  // The login page should show an error message
  const errorMessage = this.page.locator(
    "[role='alert'], .text-red-500, .text-rose-500, .bg-red-50, .bg-rose-50"
  ).first();
  await expect(errorMessage).toBeVisible({ timeout: 10000 });
});

When("I navigate to the registration page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/register`);
  await this.page.waitForLoadState("networkidle");
});

Then("I should see the registration heading", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  // Registration page should have "Create" or "Register" or "Sign up" heading
  const heading = this.page.locator("h1, h2").first();
  await expect(heading).toBeVisible({ timeout: 10000 });
});

Then("I should see the registration email input", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const emailInput = this.page.locator("input#email, input[type='email']").first();
  await expect(emailInput).toBeVisible({ timeout: 10000 });
});

Then("I should see the registration password input", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const passwordInput = this.page.locator("input#password, input[type='password']").first();
  await expect(passwordInput).toBeVisible({ timeout: 10000 });
});
