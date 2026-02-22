import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import type { ExcaliDashWorld } from "../support/world";
import { createDrawing, getDrawing, getCsrfHeaders } from "./api-helpers";

const generateLargeImageDataUrl = (sizeInBytes = 50000): string => {
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64Data = "";
  for (let i = 0; i < sizeInBytes; i += 1) {
    base64Data += base64Chars[Math.floor(Math.random() * 64)];
  }
  return `data:image/png;base64,${base64Data}`;
};

When("I create a drawing with a large image", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const largeDataUrl = generateLargeImageDataUrl(50000);
  const files = {
    "test-image-1": {
      id: "test-image-1",
      mimeType: "image/png",
      dataURL: largeDataUrl,
      created: Date.now(),
    },
  };

  const createdDrawing = await createDrawing(this.request, {
    name: "BDD Large Image",
    files,
  });

  this.createdDrawingIds.push(createdDrawing.id);
  this.scenarioData.drawingId = createdDrawing.id;
  this.scenarioData.largeImageUrl = largeDataUrl;
});

Then("the drawing should preserve the image data", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const largeDataUrl = this.scenarioData.largeImageUrl as string;
  const drawing = await getDrawing(this.request, drawingId);
  const savedFiles = drawing.files || {};
  expect(savedFiles["test-image-1"]).toBeDefined();
  expect(savedFiles["test-image-1"].dataURL).toBe(largeDataUrl);
  expect(savedFiles["test-image-1"].dataURL.length).toBe(largeDataUrl.length);
});

When("I import an image fixture drawing", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const fixturePath = path.join(__dirname, "..", "..", "fixtures", "small-image.excalidraw");
  const fixtureContent = fs.readFileSync(fixturePath, "utf-8");
  const fixtureData = JSON.parse(fixtureContent);

  const createdDrawing = await createDrawing(this.request, {
    name: "BDD Imported Image",
    files: fixtureData.files,
  });

  this.createdDrawingIds.push(createdDrawing.id);
  this.scenarioData.drawingId = createdDrawing.id;
  this.scenarioData.fixtureFiles = fixtureData.files;
});

Then("the drawing should preserve the embedded image", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const fixtureFiles = this.scenarioData.fixtureFiles as Record<string, any>;
  const drawing = await getDrawing(this.request, drawingId);
  const savedFiles = drawing.files || {};
  expect(savedFiles["embedded-test-image"]).toBeDefined();
  expect(savedFiles["embedded-test-image"].dataURL).toBe(fixtureFiles["embedded-test-image"].dataURL);
});

When("I create a drawing with multiple image sizes", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const files = {
    "small-image": {
      id: "small-image",
      mimeType: "image/png",
      dataURL: generateLargeImageDataUrl(1000),
      created: Date.now(),
    },
    "medium-image": {
      id: "medium-image",
      mimeType: "image/jpeg",
      dataURL: generateLargeImageDataUrl(15000),
      created: Date.now(),
    },
    "large-image": {
      id: "large-image",
      mimeType: "image/png",
      dataURL: generateLargeImageDataUrl(75000),
      created: Date.now(),
    },
  };

  const createdDrawing = await createDrawing(this.request, {
    name: "BDD Multi Image",
    files,
  });

  this.createdDrawingIds.push(createdDrawing.id);
  this.scenarioData.drawingId = createdDrawing.id;
  this.scenarioData.multipleFiles = files;
});

Then("the drawing should preserve all images", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const drawingId = this.scenarioData.drawingId as string;
  const files = this.scenarioData.multipleFiles as Record<string, any>;
  const drawing = await getDrawing(this.request, drawingId);
  const savedFiles = drawing.files || {};

  for (const [id, originalFile] of Object.entries(files)) {
    expect(savedFiles[id]).toBeDefined();
    expect(savedFiles[id].dataURL).toBe((originalFile as any).dataURL);
    expect(savedFiles[id].dataURL.length).toBe((originalFile as any).dataURL.length);
  }
});

When("I submit a drawing with a javascript image URL", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const maliciousFiles = {
    "malicious-image": {
      id: "malicious-image",
      mimeType: "image/png",
      dataURL: "javascript:alert('xss')",
      created: Date.now(),
    },
  };

  const response = await this.request.post(`${this.apiUrl}/drawings`, {
    headers: {
      "Content-Type": "application/json",
      ...(await getCsrfHeaders(this.request)),
    },
    data: {
      name: "Security Test - JS URL",
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: maliciousFiles,
      preview: null,
    },
  });

  expect(response.ok()).toBe(true);
  const drawing = await response.json();
  this.scenarioData.maliciousDrawing = drawing;
  this.createdDrawingIds.push(drawing.id);
});

When("I submit a drawing with a script tag in image data", async function (this: ExcaliDashWorld) {
  if (!this.request) throw new Error("Request not initialized");
  const maliciousFiles = {
    "malicious-image": {
      id: "malicious-image",
      mimeType: "image/png",
      dataURL: "data:image/png;base64,<script>alert('xss')</script>AAAA",
      created: Date.now(),
    },
  };

  const response = await this.request.post(`${this.apiUrl}/drawings`, {
    headers: {
      "Content-Type": "application/json",
      ...(await getCsrfHeaders(this.request)),
    },
    data: {
      name: "Security Test - Script Tag",
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: maliciousFiles,
      preview: null,
    },
  });

  expect(response.ok()).toBe(true);
  const drawing = await response.json();
  this.scenarioData.maliciousDrawing = drawing;
  this.createdDrawingIds.push(drawing.id);
});

Then("the image data should be sanitized", async function (this: ExcaliDashWorld) {
  const drawing = this.scenarioData.maliciousDrawing as any;
  const savedFiles = drawing.files;
  expect(savedFiles["malicious-image"].dataURL).not.toContain("javascript:");
  expect(savedFiles["malicious-image"].dataURL).not.toContain("<script>");
});
