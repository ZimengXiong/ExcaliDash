import { After, Before, AfterAll, BeforeAll, setDefaultTimeout } from "@cucumber/cucumber";
import type { Cookie, APIRequestContext } from "@playwright/test";
import { request as playwrightRequest } from "@playwright/test";
import type { ExcaliDashWorld } from "./world";
import { cleanupCollections, cleanupDrawings } from "../steps/api-helpers";
import { ensureApiAuthenticated } from "../steps/auth-helpers";
import { startServers, stopServers } from "./server-manager";

// Shared authentication state across scenarios
let sharedAuthRequest: APIRequestContext | null = null;
let authInitialized = false;

setDefaultTimeout(180000);

BeforeAll(async () => {
  await startServers();
});

Before(async function (this: ExcaliDashWorld) {
  const baseUrl = process.env.BASE_URL || this.baseUrl;
  const apiUrl = process.env.API_URL || this.apiUrl;

  this.baseUrl = baseUrl;
  this.apiUrl = apiUrl;

  // Initialize shared auth request if not already done
  if (!sharedAuthRequest) {
    sharedAuthRequest = await playwrightRequest.newContext({ baseURL: apiUrl });
  }

  // Authenticate once using the shared request context
  if (!authInitialized) {
    await ensureApiAuthenticated(sharedAuthRequest);
    authInitialized = true;
  }

  // Get auth cookies from the shared session
  const sharedState = await sharedAuthRequest.storageState();
  const parsedApiUrl = new URL(apiUrl);
  
  // Create per-scenario request context with inherited cookies
  this.request = await playwrightRequest.newContext({
    baseURL: apiUrl,
    storageState: sharedState,
  });
  this.apiUrl = apiUrl;

  const headless = process.env.HEADED === "true" ? false : true;
  await this.initBrowser(headless);

  // Copy auth cookies to browser context
  if (this.context) {
    const cookies = sharedState.cookies
      .filter((cookie) => cookie.name && cookie.value)
      .map((cookie) => {
        // Playwright's addCookies requires either 'url' OR 'domain' + 'path' (not both)
        // Using domain + path is more reliable for cross-port scenarios
        const { url, ...rest } = cookie as Cookie & { url?: string };
        return {
          ...rest,
          domain: parsedApiUrl.hostname,
          path: cookie.path || "/",
        };
      }) as Cookie[];
    if (cookies.length > 0) {
      await this.context.addCookies(cookies);
    }
  }
});

AfterAll(async () => {
  if (sharedAuthRequest) {
    await sharedAuthRequest.dispose();
    sharedAuthRequest = null;
    authInitialized = false;
  }
  await stopServers();
});


After(async function (this: ExcaliDashWorld) {
  await this.cleanup({ keepRequest: true });

  if (this.request) {
    await cleanupDrawings(this.request, this.createdDrawingIds);
    await cleanupCollections(this.request, this.createdCollectionIds);
  }

  this.createdDrawingIds = [];
  this.createdCollectionIds = [];
  await this.disposeRequest();
});
