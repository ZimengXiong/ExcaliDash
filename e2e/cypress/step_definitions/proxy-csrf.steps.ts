import { Then, When } from "@badeball/cypress-cucumber-preprocessor";
import { getScenario, setScenario } from "./shared-context";

type CsrfTokenPayload = {
  token?: unknown;
  header?: unknown;
};

const PROXY_TEST_USER_AGENT = "ExcaliDash-BDD-Proxy-CSRF/1.0";
const resolveApiUrl = () => Cypress.env("apiUrl") || "http://127.0.0.1:8000";
const resolveBaseUrl = () => Cypress.config("baseUrl") || "http://127.0.0.1:5173";

const buildForwardedForHeader = (clientIp: string, proxyChain: string): string => {
  const proxies = proxyChain
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [clientIp, ...proxies].join(", ");
};

When(
  "I request a proxied CSRF token for client {string} via {string}",
  (clientIp: string, proxyChain: string) => {
    cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const authCookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    setScenario("proxyAuthCookie", authCookie);
    cy.request({
      method: "GET",
      url: `${resolveApiUrl()}/csrf-token`,
      headers: {
        origin: resolveBaseUrl(),
        "user-agent": PROXY_TEST_USER_AGENT,
        "x-forwarded-for": buildForwardedForHeader(clientIp, proxyChain),
        Cookie: authCookie,
      },
      failOnStatusCode: true,
    }).then((response) => {
      const payload = response.body as CsrfTokenPayload;
      if (typeof payload.token !== "string" || payload.token.trim().length === 0) {
        throw new Error("Invalid CSRF token response");
      }
      setScenario("proxyCsrfToken", payload.token);
      setScenario(
        "proxyCsrfHeader",
        typeof payload.header === "string" && payload.header.trim().length > 0
          ? payload.header
          : "x-csrf-token"
      );
      const setCookie = response.headers["set-cookie"] as string | undefined;
      if (setCookie) {
        const cookie = setCookie.split(/,(?=[^;]+=[^;]+)/g)[0]?.split(";")[0] || "";
        setScenario("proxyCsrfCookie", cookie);
      }
      setScenario("proxyCsrfUserAgent", PROXY_TEST_USER_AGENT);
    });
    });
  }
);

When(
  "I submit a proxied drawing create for client {string} via {string}",
  (clientIp: string, proxyChain: string) => {
    const csrfToken = getScenario<string>("proxyCsrfToken");
    const csrfHeader = getScenario<string>("proxyCsrfHeader");
    const userAgent = getScenario<string>("proxyCsrfUserAgent");
    const csrfCookie = getScenario<string>("proxyCsrfCookie");
    const authCookie = getScenario<string>("proxyAuthCookie");

    const cookieParts = [authCookie, csrfCookie].filter(Boolean).join("; ");

    cy.request({
      method: "POST",
      url: `${resolveApiUrl()}/drawings`,
      headers: {
        origin: resolveBaseUrl(),
        "content-type": "application/json",
        "user-agent": userAgent,
        "x-forwarded-for": buildForwardedForHeader(clientIp, proxyChain),
        [csrfHeader]: csrfToken,
        Cookie: cookieParts,
      },
      body: {
        name: `BDD Proxy CSRF ${Date.now()}`,
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      },
      failOnStatusCode: false,
    }).then((response) => {
      setScenario("proxyCreateResponse", response);
    });
  }
);

When(
  "I submit a proxied drawing create without the CSRF cookie for client {string} via {string}",
  (clientIp: string, proxyChain: string) => {
    const csrfToken = getScenario<string>("proxyCsrfToken");
    const csrfHeader = getScenario<string>("proxyCsrfHeader");
    const authCookie = getScenario<string>("proxyAuthCookie");

    // Use a DIFFERENT user-agent so the legacy IP:UA fallback also fails.
    // Without trust proxy, req.ip is always 127.0.0.1, so changing X-Forwarded-For
    // alone won't differentiate via the legacy clientId. A different UA ensures
    // the legacy candidate doesn't match the one used during token issuance.
    const differentUserAgent = "ExcaliDash-BDD-Proxy-CSRF-Tampered/2.0";

    // CRITICAL: The authCookie string (from auth:login) already contains the
    // excalidash-csrf-client cookie. We must explicitly strip it out so the
    // server's getCsrfClientCookieValue() returns null and the cookie-based
    // clientId candidate is not generated during validation.
    const strippedCookie = authCookie
      .split(";")
      .map((part: string) => part.trim())
      .filter((part: string) => !part.startsWith("excalidash-csrf-client="))
      .join("; ");

    // CRITICAL: cy.request() automatically sends cookies from the Cypress browser
    // cookie jar. The beforeEach hook in e2e.ts sets excalidash-csrf-client in the
    // jar via cy.setCookie(). Even though we stripped it from the Cookie header,
    // Cypress will re-attach it from the jar. We must clear it from the jar first.
    cy.clearCookie("excalidash-csrf-client");

    cy.request({
      method: "POST",
      url: `${resolveApiUrl()}/drawings`,
      headers: {
        origin: resolveBaseUrl(),
        "content-type": "application/json",
        "user-agent": differentUserAgent,
        "x-forwarded-for": buildForwardedForHeader(clientIp, proxyChain),
        [csrfHeader]: csrfToken,
        Cookie: strippedCookie,
      },
      body: {
        name: `BDD Proxy CSRF ${Date.now()}`,
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      },
      failOnStatusCode: false,
    }).then((response) => {
      setScenario("proxyCreateResponse", response);
    });
  }
);

Then("the proxied drawing create should succeed", () => {
  const response = getScenario<Cypress.Response<any>>("proxyCreateResponse");
  expect(response.status).to.eq(200);
});

Then("the proxied drawing create should fail with CSRF validation error", () => {
  const response = getScenario<Cypress.Response<any>>("proxyCreateResponse");
  expect(response.status).to.eq(403);
  const bodyStr = typeof response.body === "string" ? response.body : JSON.stringify(response.body || "");
  expect(bodyStr.toLowerCase()).to.contain("csrf");
});
