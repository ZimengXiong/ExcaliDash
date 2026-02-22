import { When, Then } from "@badeball/cypress-cucumber-preprocessor";
import { getScenario } from "./shared-context";
import { getDrawing, updateDrawing } from "./api-helpers";

const waitForExcalidrawReady = () => {
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
  cy.window().should((win: any) => {
    expect(win.__EXCALIDASH_EXCALIDRAW_API__).to.exist;
    expect(win.__EXCALIDASH_SOCKET_STATUS__?.connected).to.eq(true);
  });
};

const injectImageElementThenFile = () =>
  cy.window().then(async (win: any) => {
    const api = win.__EXCALIDASH_EXCALIDRAW_API__;
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

When("I open two editor tabs for the drawing", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit(`/editor/${drawingId}`);
  waitForExcalidrawReady();
});

When("I inject an image element and file data in the first tab", () => {
  return injectImageElementThenFile().then((result: any) => {
    const { fileId } = result;
    Cypress.env("imageFileId", fileId);
    const drawingId = getScenario<string>("drawingId");
    return cy.window().then((win: any) => {
      const api = win.__EXCALIDASH_EXCALIDRAW_API__;
      const snapshot = {
        elements: api.getSceneElementsIncludingDeleted(),
        files: api.getFiles?.() || {},
        appState: {
          viewBackgroundColor: api.getAppState?.().viewBackgroundColor ?? "#ffffff",
          gridSize: api.getAppState?.().gridSize ?? null,
        },
      };
      return updateDrawing(drawingId, snapshot);
    });
  });
});

Then("the second tab should receive the image file", () => {
  const fileId = Cypress.env("imageFileId") as string;
  cy.window().should((win: any) => {
    const files = win.__EXCALIDASH_EXCALIDRAW_API__?.getFiles?.() || {};
    expect(files[fileId]).to.exist;
  });
});

Then("the drawing should persist the image file", () => {
  const drawingId = getScenario<string>("drawingId");
  const fileId = Cypress.env("imageFileId") as string;
  return getDrawing(drawingId).then((persisted) => {
    const persistedFile = persisted.files?.[fileId];
    expect(typeof persistedFile?.dataURL).to.eq("string");
    expect((persistedFile?.dataURL || "").length).to.be.greaterThan(0);
  });
});
