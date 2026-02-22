import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getCsrfHeaders, getDrawing, listDrawings } from "./api-helpers";
import { applyDashboardSearch, waitForDashboard } from "./ui-helpers";

When("I rename the collection to {string}", async function (this: ExcaliDashWorld, newName: string) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const collectionName = this.scenarioData.collectionName as string;
  if (!collectionName) throw new Error("Collection name not set");

  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);

  const collectionButton = this.page.getByRole("navigation").getByRole("button", { name: collectionName });
  await collectionButton.dblclick();

  const nameInput = this.page.getByRole("textbox").first();
  await nameInput.fill(newName);
  await nameInput.press("Enter");

  await expect.poll(async () => {
    if (!this.request) return false;
    const collectionsResponse = await this.request.get(`${this.apiUrl}/collections`);
    const collections = await collectionsResponse.json();
    return collections.some((item: any) => item.name === newName);
  }, { timeout: 10000 }).toBe(true);

  this.scenarioData.collectionName = newName;
});

Then("the collection should be renamed to {string}", async function (this: ExcaliDashWorld, name: string) {
  if (!this.request) throw new Error("Request not initialized");
  const collectionsResponse = await this.request.get(`${this.apiUrl}/collections`);
  const collections = await collectionsResponse.json();
  const collection = collections.find((item: any) => item.name === name);
  expect(collection).toBeTruthy();
  this.scenarioData.collectionId = collection?.id;
});

When("I delete the collection", async function (this: ExcaliDashWorld) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const collectionName = this.scenarioData.collectionName as string;
  if (!collectionName) throw new Error("Collection name not set");

  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);

  const collectionButton = this.page.getByRole("navigation").getByRole("button", { name: collectionName });
  await collectionButton.click({ button: "right" });

  const contextMenu = this.page.locator(".fixed.inset-0.z-50");
  const deleteAction = contextMenu.getByRole("button", { name: /Delete Collection/i });
  await deleteAction.click();

  const confirmDialog = this.page.locator(".fixed.inset-0").filter({ hasText: "Delete Collection" }).first();
  await expect(confirmDialog).toBeVisible({ timeout: 10000 });
  await confirmDialog.getByRole("button", { name: /Delete Collection/i }).click();
});

Then("drawings from the collection should be unorganized", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  await expect.poll(async () => {
    const updated = await getDrawing(this.request!, drawingId);
    return updated.collectionId === null;
  }, { timeout: 20000 }).toBe(true);
});

When("I open the settings page", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  await this.page.goto(`${this.baseUrl}/settings`);
  await this.page.waitForLoadState("networkidle");
});

When("I import a JSON drawing via settings", async function (this: ExcaliDashWorld) {
  if (!this.page || !this.request) throw new Error("Page or request not initialized");
  const importName = `Settings_Import_${Date.now()}`;
  this.scenarioData.importName = importName;

  const payload = {
    name: importName,
    elements: [
      {
        id: "settings-rect",
        type: "rectangle",
        x: 120,
        y: 120,
        width: 140,
        height: 90,
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

  await expect.poll(async () => {
    try {
      const drawings = await listDrawings(this.request!, { search: importName, includeData: true });
      return drawings.some((drawing) => drawing.name?.includes(importName));
    } catch {
      return false;
    }
  }, { timeout: 120000 }).toBe(true);
});

Then("the imported drawing should be visible on the dashboard", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const importName = (this.scenarioData.importName as string) || "Settings_Import";
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  await applyDashboardSearch(this.page, importName);
  await expect(this.page.locator("[id^='drawing-card-']").first()).toBeVisible();
});

When("I import a backup file", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const drawingName = `Backup_Import_${Date.now()}`;
  this.scenarioData.importName = drawingName;
  const manifest = {
    format: "excalidash",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    excalidashBackendVersion: "test",
    unorganizedFolder: "Unorganized",
    collections: [],
    drawings: [
      {
        id: `drawing-${Date.now()}`,
        name: drawingName,
        collectionId: null,
        filePath: "drawings/drawing-1.json",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const drawingPayload = {
    id: manifest.drawings[0].id,
    name: drawingName,
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };

  const archive = { manifest, drawing: drawingPayload };

  await this.page.goto(`${this.baseUrl}/settings`);
  await this.page.waitForLoadState("networkidle");

  await this.page.route("**/import/excalidash/verify", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        valid: true,
        formatVersion: manifest.formatVersion,
        exportedAt: manifest.exportedAt,
        excalidashBackendVersion: manifest.excalidashBackendVersion,
        collections: 0,
        drawings: 1,
      }),
    });
  });

  await this.page.route("**/import/excalidash", async (route) => {
    if (!this.request) {
      await route.abort();
      return;
    }
    const headers = {
      ...(await getCsrfHeaders(this.request)),
      "Content-Type": "application/json",
    };
    const response = await this.request.post(`${this.apiUrl}/drawings`, {
      headers,
      data: drawingPayload,
    });
    if (!response.ok()) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Backup import failed" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  const fileInput = this.page.locator("#settings-import-backup");
  await fileInput.setInputFiles({
    name: `excalidash-backup-${Date.now()}.excalidash`,
    mimeType: "application/zip",
    buffer: Buffer.from(JSON.stringify(archive), "utf8"),
  });
});

When("I confirm the backup import", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const confirmButton = this.page.getByRole("button", { name: "Import" });
  await expect(confirmButton).toBeVisible({ timeout: 15000 });
  await confirmButton.click();
});

Then("the backup import should succeed", async function (this: ExcaliDashWorld) {
  if (!this.page) throw new Error("Page not initialized");
  const successModal = this.page.getByRole("heading", { name: "Backup Imported" });
  await expect(successModal).toBeVisible({ timeout: 30000 });
  await this.page.getByRole("button", { name: "OK" }).click();
  const importName = this.scenarioData.importName as string;
  await this.page.goto(`${this.baseUrl}/`);
  await waitForDashboard(this.page);
  await applyDashboardSearch(this.page, importName);
  await expect(this.page.locator("[id^='drawing-card-']").first()).toBeVisible();
});
