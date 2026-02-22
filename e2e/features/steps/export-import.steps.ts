import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getCsrfHeaders, listDrawings } from "./api-helpers";

When("I view export options", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/settings`);
  await this.page.waitForLoadState("networkidle");
});

Then("I should see the SQLite export option", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const button = this.page.getByRole("button", { name: /Export Data \(.sqlite\)/i });
  await expect(button).toBeVisible();
  const dbButton = this.page.getByRole("button", { name: /Export Data \(.db\)/i });
  await expect(dbButton).toBeVisible();
});

Then("I should see the JSON export option", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const button = this.page.getByRole("button", { name: /Export Data \(JSON\)/i });
  await expect(button).toBeVisible();
});

When("I request the JSON export endpoint", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  this.scenarioData.exportResponse = await this.request.get(`${this.apiUrl}/export/json`);
});

Then("I should receive a zip export response", async function (this: ExcaliDashWorld) {
  const response = this.scenarioData.exportResponse as Awaited<ReturnType<NonNullable<ExcaliDashWorld["request"]>["get"]>>;
  expect(response.ok()).toBe(true);
  const contentType = response.headers()["content-type"];
  expect(contentType).toMatch(/application\/zip/);
  const contentDisposition = response.headers()["content-disposition"];
  expect(contentDisposition).toContain("attachment");
});

When("I request the SQLite export endpoint", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  this.scenarioData.exportResponse = await this.request.get(`${this.apiUrl}/export`);
});

Then("I should receive a SQLite export response", async function (this: ExcaliDashWorld) {
  const response = this.scenarioData.exportResponse as Awaited<ReturnType<NonNullable<ExcaliDashWorld["request"]>["get"]>>;
  expect(response.ok()).toBe(true);
  const contentType = response.headers()["content-type"];
  expect(contentType).toMatch(/application\/octet-stream|application\/x-sqlite3/);
  const contentDisposition = response.headers()["content-disposition"];
  expect(contentDisposition).toContain("attachment");
});

When("I request the DB export endpoint", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  this.scenarioData.exportResponse = await this.request.get(`${this.apiUrl}/export?format=db`);
});

Then("I should receive a DB export response", async function (this: ExcaliDashWorld) {
  const response = this.scenarioData.exportResponse as Awaited<ReturnType<NonNullable<ExcaliDashWorld["request"]>["get"]>>;
  expect(response.ok()).toBe(true);
  const contentDisposition = response.headers()["content-disposition"];
  expect(contentDisposition).toContain("attachment");
});

When("I import a drawing file named {string}", async function (this: ExcaliDashWorld, name: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  this.scenarioData.importName = name;

  const payload = {
    name,
    elements: [
      {
        id: "test-rect-1",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        angle: 0,
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: 12345,
        version: 1,
        versionNonce: 67890,
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
      },
    ],
    appState: {
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  };

  const headers = await getCsrfHeaders(this.request);
  const response = await this.request.post(`${this.apiUrl}/drawings`, {
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "X-Imported-File": "true",
    },
    data: payload,
  });
  expect(response.ok()).toBe(true);

  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");
});

Then("I should see the drawing {string} in the dashboard", async function (this: ExcaliDashWorld, name: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const importName = (this.scenarioData.importName as string) || name;
  await expect.poll(async () => {
    try {
      const drawings = await listDrawings(this.request!, { search: importName, includeData: true });
      return drawings.some((drawing) => drawing.name.includes(importName));
    } catch {
      return false;
    }
  }, { timeout: 90000 }).toBe(true);
});

When("I import a json drawing file named {string}", async function (this: ExcaliDashWorld, name: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  this.scenarioData.importName = name;

  const payload = {
    name,
    elements: [
      {
        id: "test-element",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        angle: 0,
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: 12345,
        version: 1,
        versionNonce: 12345,
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
      },
    ],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };

  const headers = await getCsrfHeaders(this.request);
  const response = await this.request.post(`${this.apiUrl}/drawings`, {
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "X-Imported-File": "true",
    },
    data: payload,
  });
  expect(response.ok()).toBe(true);

  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");
});

When("I import an invalid drawing file", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");

  const invalidContent = "this is not valid JSON or excalidraw format {}{}";
  const fileInput = this.page.locator("#dashboard-import");
  await fileInput.setInputFiles({
    name: `Import_Invalid_${Date.now()}.excalidraw`,
    mimeType: "application/json",
    buffer: Buffer.from(invalidContent),
  });
});

When("I import an unsupported library file", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");

  const fileInput = this.page.locator("#dashboard-import");
  await fileInput.setInputFiles({
    name: `Library_${Date.now()}.excalidrawlib`,
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
});

Then("I should see the unsupported library import error", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const failureHeading = this.page.getByRole("heading", { name: "Import Failed" });
  await expect(failureHeading).toBeVisible({ timeout: 10000 });
  await expect(this.page.getByText("Library (.excalidrawlib) imports are not supported"))
    .toBeVisible({ timeout: 10000 });
});

Then("I should see the import failure status", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  // The import failure could show as either:
  // 1. A "Failed" status in the upload indicator
  // 2. An "Import Failed" modal heading
  // Check for either one to be present (not necessarily visible, just in DOM)
  const failedStatus = this.page.locator("span.text-rose-500:has-text('Failed')");
  const failedModal = this.page.getByRole("heading", { name: "Import Failed" });
  await expect.poll(async () => {
    const statusCount = await failedStatus.count();
    const modalCount = await failedModal.count();
    return statusCount + modalCount;
  }, { timeout: 10000 }).toBeGreaterThan(0);
});

When("I import multiple drawings named {string}", async function (this: ExcaliDashWorld, prefix: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  this.scenarioData.importName = prefix;

  const headers = await getCsrfHeaders(this.request);
  const payloads = [
    {
      name: `${prefix}_A`,
      elements: [
        {
          id: "multi-rect-a",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 100,
          height: 100,
          angle: 0,
          strokeColor: "#000000",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: { type: 3 },
          seed: 12345,
          version: 1,
          versionNonce: 12345,
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    },
    {
      name: `${prefix}_B`,
      elements: [
        {
          id: "multi-rect-b",
          type: "rectangle",
          x: 140,
          y: 140,
          width: 120,
          height: 120,
          angle: 0,
          strokeColor: "#000000",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: { type: 3 },
          seed: 23456,
          version: 1,
          versionNonce: 23456,
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
        },
      ],
      appState: { viewBackgroundColor: "#f0f0f0" },
      files: {},
    },
  ];

  for (const payload of payloads) {
    const response = await this.request.post(`${this.apiUrl}/drawings`, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "X-Imported-File": "true",
      },
      data: payload,
    });
    expect(response.ok()).toBe(true);
  }

  await this.page.goto(`${this.baseUrl}/`);
  await this.page.waitForLoadState("networkidle");
});

When("I verify the database import endpoint", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const headers = await getCsrfHeaders(this.request);
  this.scenarioData.dbVerifyResponse = await this.request.post(`${this.apiUrl}/import/sqlite/verify`, {
    headers,
    multipart: {
      db: {
        name: "test.sqlite",
        mimeType: "application/x-sqlite3",
        buffer: Buffer.from(""),
      },
    },
  });
});

Then("the database import verification should respond with an error", async function (this: ExcaliDashWorld) {
  const response = this.scenarioData.dbVerifyResponse as Awaited<ReturnType<NonNullable<ExcaliDashWorld["request"]>["post"]>>;
  expect([400, 500]).toContain(response.status());
});
