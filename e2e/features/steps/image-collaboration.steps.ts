import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { ExcaliDashWorld } from "../support/world";
import { getDrawing, updateDrawing } from "./api-helpers";

const waitForExcalidrawReady = async (page: Page) => {
  await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  await page.waitForFunction(() => {
    return !!(window as any).__EXCALIDASH_EXCALIDRAW_API__;
  });
  await page.waitForFunction(() => {
    return (window as any).__EXCALIDASH_SOCKET_STATUS__?.connected === true;
  });
};

const waitForFileInEditor = async (page: Page, fileId: string) => {
  const timeoutMs = 30000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page.evaluate((id) => {
      const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
      const files = api?.getFiles?.() || {};
      const entry = files?.[id];
      return !!entry && typeof entry.mimeType === "string";
    }, fileId);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for file ${fileId}`);
};

const injectImageElementThenFile = async (page: Page) =>
  page.evaluate(async () => {
    const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
    if (!api) throw new Error("Missing __EXCALIDASH_EXCALIDRAW_API__");

    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const fileId = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const elementId = `img_${Math.random().toString(36).slice(2)}`;

    const dataURL =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAIElEQVR42mP8z8Dwn4EIwDiqgWjAqIGhBo4aGAAAcO0Gg+o1P8oAAAAASUVORK5CYII=";

    const now = Date.now();
    const element = {
      id: elementId,
      type: "image",
      x: 120,
      y: 120,
      width: 240,
      height: 240,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roundness: null,
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      seed: Math.floor(Math.random() * 2 ** 31),
      version: 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      isDeleted: false,
      boundElements: null,
      link: null,
      locked: false,
      index: "a1",
      updated: now,
      status: "pending",
      fileId,
      scale: [1, 1],
      crop: null,
    };

    const before = api.getSceneElementsIncludingDeleted();
    api.updateScene({ elements: [...before, element] });

    await new Promise((resolve) => setTimeout(resolve, 600));
    api.addFiles({
      [fileId]: {
        id: fileId,
        mimeType: "image/png",
        dataURL,
        created: Date.now(),
        lastRetrieved: Date.now(),
      },
    });

    return { fileId, elementId };
  });

When("I open two editor tabs for the drawing", async function (this: ExcaliDashWorld) {
  if (!this.browser || !this.context) throw new Error("Browser not initialized");
  const drawingId = this.scenarioData.drawingId as string;

  // Get cookies from the authenticated main context
  const cookies = await this.context.cookies();

  const context1 = await this.browser.newContext();
  const context2 = await this.browser.newContext();
  
  // Copy auth cookies to new contexts
  if (cookies.length > 0) {
    await context1.addCookies(cookies);
    await context2.addCookies(cookies);
  }

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  this.extraContexts.push(context1, context2);
  this.extraPages.push(page1, page2);

  await page1.goto(`${this.baseUrl}/editor/${drawingId}`);
  await page2.goto(`${this.baseUrl}/editor/${drawingId}`);

  await waitForExcalidrawReady(page1);
  await waitForExcalidrawReady(page2);

  this.scenarioData.page1 = page1;
  this.scenarioData.page2 = page2;
});

When("I inject an image element and file data in the first tab", async function (this: ExcaliDashWorld) {
  const page1 = this.scenarioData.page1 as Page;
  const result = await injectImageElementThenFile(page1);
  this.scenarioData.imageFileId = result.fileId;
  this.scenarioData.imageElementId = result.elementId;

  const snapshot = await page1.evaluate(() => {
    const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
    const elements = api.getSceneElementsIncludingDeleted();
    const files = api.getFiles?.() || {};
    const appState = api.getAppState?.() || {};
    return {
      elements,
      files,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff",
        gridSize: appState.gridSize ?? null,
      },
    };
  });

  if (this.request) {
    const drawingId = this.scenarioData.drawingId as string;
    await updateDrawing(this.request, drawingId, snapshot);
  }
});

Then("the second tab should receive the image file", async function (this: ExcaliDashWorld) {
  const page2 = this.scenarioData.page2 as Page;
  const fileId = this.scenarioData.imageFileId as string;
  await waitForFileInEditor(page2, fileId);
});

Then("the drawing should persist the image file", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const fileId = this.scenarioData.imageFileId as string;
  const persisted = await getDrawing(this.request, drawingId);
  const persistedFile = persisted.files?.[fileId];
  expect(typeof persistedFile?.dataURL).toBe("string");
  expect((persistedFile?.dataURL || "").length).toBeGreaterThan(0);
});
