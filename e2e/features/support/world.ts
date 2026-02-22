import { IWorldOptions, setWorldConstructor } from "@cucumber/cucumber";
import { APIRequestContext, Browser, BrowserContext, Page, request as playwrightRequest, chromium } from "@playwright/test";
import { API_URL } from "../steps/api-helpers";

export type ApiHelper = {
  get: APIRequestContext["get"];
  post: APIRequestContext["post"];
  put: APIRequestContext["put"];
  delete: APIRequestContext["delete"];
};

export class ExcaliDashWorld {
  browser: Browser | null = null;
  context: BrowserContext | null = null;
  page: Page | null = null;
  request: APIRequestContext | null = null;
  extraContexts: BrowserContext[] = [];
  extraPages: Page[] = [];
  baseUrl: string;
  apiUrl: string;
  createdDrawingIds: string[] = [];
  createdCollectionIds: string[] = [];
  createdUserIds: string[] = [];
  scenarioData: Record<string, unknown> = {};

  constructor(options: IWorldOptions) {
    this.baseUrl = options.parameters?.baseUrl || "http://127.0.0.1:5173";
    this.apiUrl = options.parameters?.apiUrl || "http://127.0.0.1:8000";
  }

  async initBrowser(headless = true) {
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async initRequestContext() {
    const resolvedApiUrl = process.env.API_URL || this.apiUrl || API_URL;
    this.apiUrl = resolvedApiUrl;
    this.request = await playwrightRequest.newContext({ baseURL: resolvedApiUrl });
  }

  async cleanup(options: { keepRequest?: boolean } = {}) {
    for (const page of this.extraPages) {
      await page.close();
    }
    for (const context of this.extraContexts) {
      await context.close();
    }
    this.extraPages = [];
    this.extraContexts = [];

    if (this.page) {
      await this.page.close();
    }
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    if (this.request && !options.keepRequest) {
      await this.request.dispose();
    }
    this.page = null;
    this.context = null;
    this.browser = null;
    if (!options.keepRequest) {
      this.request = null;
    }
  }

  async disposeRequest() {
    if (this.request) {
      await this.request.dispose();
    }
    this.request = null;
  }
}

setWorldConstructor(ExcaliDashWorld);
