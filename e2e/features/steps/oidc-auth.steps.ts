import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getAuthStatus } from "./api-helpers";

// ---------------------------------------------------------------------------
// These scenarios require an OIDC provider (Keycloak) to be running.
// They are tagged @oidc and should be run when docker-compose.oidc.yml is up.
// ---------------------------------------------------------------------------

const resolveApiUrl = (world: ExcaliDashWorld) =>
  process.env.API_URL || world.apiUrl || "http://127.0.0.1:8000";

/**
 * Make an HTTP GET request without following redirects.
 * Uses Node's built-in fetch (Node 18+) with redirect: "manual".
 */
async function fetchNoRedirect(
  url: string,
  cookies?: string
): Promise<{ status: number; headers: Record<string, string> }> {
  const headers: Record<string, string> = {};
  if (cookies) headers.cookie = cookies;

  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers,
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value;
  });

  return { status: response.status, headers: responseHeaders };
}

/**
 * Extract Set-Cookie values from a fetch response headers.
 */
function extractSetCookies(headers: Record<string, string>): string {
  // The 'set-cookie' header may contain multiple cookies joined by comma
  // but for our use case we just need to forward the raw value
  return headers["set-cookie"] || "";
}

Given("the server is running with OIDC enabled", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const status = await getAuthStatus(this.request);
  // Verify the server is configured in hybrid or oidc_enforced mode
  const oidcEnabled = status.oidcEnabled === true;
  if (!oidcEnabled) {
    throw new Error(
      "Server is not configured with OIDC enabled. " +
        "Set AUTH_MODE to 'hybrid' or 'oidc_enforced' and configure OIDC env vars. " +
        `Current authMode: ${status.authMode}`
    );
  }
  this.scenarioData.authStatus = status;
});

Given("auth mode is {string}", async function (this: ExcaliDashWorld, expectedMode: string) {
  if (!this.request) throw new Error("Request not initialized");
  const status = await getAuthStatus(this.request);
  const currentMode = status.authMode as string;
  if (currentMode !== expectedMode) {
    // Skip this scenario if the server is not in the expected mode
    return "pending";
  }
  this.scenarioData.authStatus = status;
});

// ---------------------------------------------------------------------------
// Auth status checks
// ---------------------------------------------------------------------------

When("I request the auth status", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const status = await getAuthStatus(this.request);
  this.scenarioData.authStatus = status;
});

Then("the auth status should indicate OIDC is enabled", async function (this: ExcaliDashWorld) {
  const status = this.scenarioData.authStatus as Record<string, unknown>;
  expect(status.oidcEnabled).toBe(true);
});

Then("the auth status should include an OIDC provider name", async function (this: ExcaliDashWorld) {
  const status = this.scenarioData.authStatus as Record<string, unknown>;
  expect(typeof status.oidcProvider).toBe("string");
  expect((status.oidcProvider as string).length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// OIDC start endpoint
// ---------------------------------------------------------------------------

When("I request the OIDC start endpoint", async function (this: ExcaliDashWorld) {
  const apiUrl = resolveApiUrl(this);

  // Use native fetch with redirect: "manual" to capture the 302 redirect
  const result = await fetchNoRedirect(`${apiUrl}/auth/oidc/start`);
  this.scenarioData.oidcStartStatus = result.status;
  this.scenarioData.oidcStartHeaders = result.headers;
  this.scenarioData.oidcStartLocation = result.headers["location"] || "";
});

Then("I should be redirected to the OIDC authorization URL", async function (this: ExcaliDashWorld) {
  const status = this.scenarioData.oidcStartStatus as number;
  // Server should respond with a 302 redirect
  expect(status).toBe(302);

  const location = this.scenarioData.oidcStartLocation as string;
  expect(location).toBeTruthy();
  // The redirect URL should be to the OIDC provider (Keycloak or other)
  // It should contain typical OIDC authorization parameters
  expect(location).toContain("response_type=code");
  expect(location).toContain("client_id=");
  expect(location).toContain("scope=");
  expect(location).toContain("state=");
});

Then("the redirect URL should include a code challenge", async function (this: ExcaliDashWorld) {
  const location = this.scenarioData.oidcStartLocation as string;
  expect(location).toContain("code_challenge=");
  expect(location).toContain("code_challenge_method=S256");
});

// ---------------------------------------------------------------------------
// Login page UI checks
// ---------------------------------------------------------------------------

// "I navigate to the login page" is defined in login-registration.steps.ts

Then("I should see a {string} OIDC button", async function (this: ExcaliDashWorld, buttonTextPrefix: string) {
  if (!this.page) throw new Error("Page not initialized");
  // The button text is "Continue with {providerName}" or similar
  const button = this.page.getByRole("button", { name: new RegExp(buttonTextPrefix, "i") });
  await expect(button).toBeVisible({ timeout: 10000 });
});

Then("I should also see the local email and password fields", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const emailInput = this.page.locator("input#email");
  const passwordInput = this.page.locator("input#password");
  await expect(emailInput).toBeVisible({ timeout: 5000 });
  await expect(passwordInput).toBeVisible({ timeout: 5000 });
});

Then("I should see the OIDC provider name in the heading", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const status = this.scenarioData.authStatus as Record<string, unknown>;
  const providerName = (status.oidcProvider as string) || "OIDC";
  const heading = this.page.getByRole("heading", { name: new RegExp(providerName, "i") });
  await expect(heading).toBeVisible({ timeout: 10000 });
});

Then("I should not see email and password input fields", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  // In oidc_enforced mode, the local login form should not be shown
  const emailInput = this.page.locator("input#email");
  const passwordInput = this.page.locator("input#password");
  await expect(emailInput).toBeHidden({ timeout: 5000 });
  await expect(passwordInput).toBeHidden({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// OIDC error display
// ---------------------------------------------------------------------------

When("I navigate to the login page with an OIDC error", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const errorCode = "provider_error";
  const errorMessage = "OIDC provider returned an error.";
  const params = new URLSearchParams({
    oidcError: errorCode,
    oidcErrorMessage: errorMessage,
  });
  await this.page.goto(`${this.baseUrl}/login?${params.toString()}`);
  await this.page.waitForLoadState("networkidle");
  this.scenarioData.expectedOidcErrorMessage = errorMessage;
});

Then("I should see the OIDC error message displayed", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const expectedMessage = this.scenarioData.expectedOidcErrorMessage as string;
  const errorContainer = this.page.locator("text=" + expectedMessage);
  await expect(errorContainer).toBeVisible({ timeout: 10000 });
});

// ---------------------------------------------------------------------------
// OIDC callback error handling
// ---------------------------------------------------------------------------

When("I request the OIDC callback without a flow cookie", async function (this: ExcaliDashWorld) {
  const apiUrl = resolveApiUrl(this);

  // Call the callback endpoint without the flow cookie - should redirect with error
  const result = await fetchNoRedirect(
    `${apiUrl}/auth/oidc/callback?code=fake_code&state=fake_state`
  );
  this.scenarioData.callbackStatus = result.status;
  this.scenarioData.callbackLocation = result.headers["location"] || "";
});

When("I request the OIDC callback with an error parameter", async function (this: ExcaliDashWorld) {
  const apiUrl = resolveApiUrl(this);

  // First start the OIDC flow to get the flow cookie
  const startResult = await fetchNoRedirect(`${apiUrl}/auth/oidc/start`);
  const flowCookie = extractSetCookies(startResult.headers);

  // Now call callback with error parameter, forwarding the flow cookie
  const result = await fetchNoRedirect(
    `${apiUrl}/auth/oidc/callback?error=access_denied&error_description=User+denied+access`,
    flowCookie
  );
  this.scenarioData.callbackStatus = result.status;
  this.scenarioData.callbackLocation = result.headers["location"] || "";
});

Then(
  "I should be redirected to the login page with a {string} error",
  async function (this: ExcaliDashWorld, expectedErrorCode: string) {
    const status = this.scenarioData.callbackStatus as number;
    expect(status).toBe(302);

    const location = this.scenarioData.callbackLocation as string;
    expect(location).toBeTruthy();
    expect(location).toContain("/login");
    expect(location).toContain(`oidcError=${expectedErrorCode}`);
  }
);
