import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";

type CsrfTokenPayload = {
  token?: unknown;
  header?: unknown;
};

type PostResponse = Awaited<
  ReturnType<NonNullable<ExcaliDashWorld["request"]>["post"]>
>;

const PROXY_TEST_USER_AGENT = "ExcaliDash-BDD-Proxy-CSRF/1.0";

const buildForwardedForHeader = (clientIp: string, proxyChain: string): string => {
  const proxies = proxyChain
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [clientIp, ...proxies].join(", ");
};

const requireScenarioString = (
  world: ExcaliDashWorld,
  key: string
): string => {
  const value = world.scenarioData[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing scenario data: ${key}`);
  }
  return value;
};

When(
  "I request a proxied CSRF token for client {string} via {string}",
  async function (this: ExcaliDashWorld, clientIp: string, proxyChain: string) {
    if (!this.request) throw new Error("Request not initialized");

    const response = await this.request.get(`${this.apiUrl}/csrf-token`, {
      headers: {
        origin: process.env.BASE_URL || this.baseUrl,
        "user-agent": PROXY_TEST_USER_AGENT,
        "x-forwarded-for": buildForwardedForHeader(clientIp, proxyChain),
      },
    });

    const status = response.status();
    const bodyText = await response.text();
    if (!response.ok()) {
      throw new Error(`Failed to fetch proxied CSRF token: ${status} ${bodyText}`);
    }

    const payload = JSON.parse(bodyText) as CsrfTokenPayload;
    if (typeof payload.token !== "string" || payload.token.trim().length === 0) {
      throw new Error(`Invalid CSRF token response: ${bodyText}`);
    }

    this.scenarioData.proxyCsrfToken = payload.token;
    this.scenarioData.proxyCsrfHeader =
      typeof payload.header === "string" && payload.header.trim().length > 0
        ? payload.header
        : "x-csrf-token";
    this.scenarioData.proxyCsrfUserAgent = PROXY_TEST_USER_AGENT;
  }
);

When(
  "I submit a proxied drawing create for client {string} via {string}",
  async function (this: ExcaliDashWorld, clientIp: string, proxyChain: string) {
    if (!this.request) throw new Error("Request not initialized");

    const csrfToken = requireScenarioString(this, "proxyCsrfToken");
    const csrfHeader = requireScenarioString(this, "proxyCsrfHeader");
    const userAgent = requireScenarioString(this, "proxyCsrfUserAgent");

    const response = await this.request.post(`${this.apiUrl}/drawings`, {
      headers: {
        origin: process.env.BASE_URL || this.baseUrl,
        "content-type": "application/json",
        "user-agent": userAgent,
        "x-forwarded-for": buildForwardedForHeader(clientIp, proxyChain),
        [csrfHeader]: csrfToken,
      },
      data: {
        name: `BDD Proxy CSRF ${Date.now()}`,
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      },
    });

    this.scenarioData.proxyCreateResponse = response;

    if (response.ok()) {
      const payload = (await response.json()) as { id?: unknown };
      if (typeof payload.id === "string" && payload.id.length > 0) {
        this.createdDrawingIds.push(payload.id);
      }
    }
  }
);

Then(
  "the proxied drawing create should succeed",
  async function (this: ExcaliDashWorld) {
    const response = this.scenarioData.proxyCreateResponse as PostResponse | undefined;
    if (!response) throw new Error("Missing proxied drawing create response");

    const status = response.status();
    const body = await response.text();
    if (!response.ok()) {
      console.error(`Proxied drawing create failed: ${status} ${body}`);
    }
    expect(response.ok()).toBe(true);
  }
);

Then(
  "the proxied drawing create should fail with CSRF validation error",
  async function (this: ExcaliDashWorld) {
    const response = this.scenarioData.proxyCreateResponse as PostResponse | undefined;
    if (!response) throw new Error("Missing proxied drawing create response");

    const status = response.status();
    const body = await response.text();
    expect(status).toBe(403);
    expect(body.toLowerCase()).toContain("csrf");
  }
);
