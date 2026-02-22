import { When, Then, After } from "@badeball/cypress-cucumber-preprocessor";
import { getScenario } from "./shared-context";

const waitForSocketConnected = () => {
  cy.window().should((win: any) => {
    expect(win.__EXCALIDASH_SOCKET_STATUS__?.connected).to.eq(true);
  });
};

const injectRectangleAndFiles = () =>
  cy.window().then((win: any) => {
    const api = win.__EXCALIDASH_EXCALIDRAW_API__;
    if (!api) throw new Error("Missing __EXCALIDASH_EXCALIDRAW_API__");
    const now = Date.now();
    const element = {
      id: `bdd-rect-${now}`,
      type: "rectangle",
      x: 100,
      y: 100,
      width: 120,
      height: 80,
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
      seed: 1,
      version: 1,
      versionNonce: 2,
      isDeleted: false,
      boundElements: null,
      updated: now,
      link: null,
      locked: false,
    };
    const elements = api.getSceneElementsIncludingDeleted();
    api.updateScene({ elements: [...elements, element] });
  });

When("two users open the drawing", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit(`/editor/${drawingId}`);
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
  waitForSocketConnected();
  cy.task("auth:login").then(({ cookieHeader }: any) => {
    return cy.task("socket:connect", { drawingId, cookie: cookieHeader });
  });
});

When("two users draw on the same canvas", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit(`/editor/${drawingId}`);
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
  waitForSocketConnected();
  // Intercept the auto-save PUT so we can wait for it
  cy.intercept("PUT", `**/drawings/${drawingId}`).as("autoSave");
  injectRectangleAndFiles();
  // Wait for the debounced auto-save to fire
  cy.wait("@autoSave", { timeout: 20000 });
});

When("two users move their cursors", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit(`/editor/${drawingId}`);
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
  waitForSocketConnected();
  cy.task("auth:login").then(({ cookieHeader }: any) => {
    return cy.task("socket:connect", { drawingId, cookie: cookieHeader });
  });
  cy.task("socket:cursor", { drawingId });
});

Then("a collaborator indicator should be visible", () => {
  // Excalidraw renders collaborator avatars inside a container with class
  // "UserList-Wrapper" and individual avatars with class prefix "Avatar".
  // We also check for the original test selectors as fallbacks.
  cy.get("[class*='UserList'], [class*='Avatar'], [data-testid='collaborator-avatar'], .collaborator-avatar, [class*='collaborator']", { timeout: 15000 }).should(
    "exist"
  );
});

Then("the collaboration session should remain active", () => {
  cy.get("canvas.excalidraw__canvas.interactive").should("be.visible");
});

After(() => {
  cy.task("socket:disconnect");
});

When("I draw a rectangle and reload the editor", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit(`/editor/${drawingId}`);
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
  // Intercept auto-save so we can wait for persistence before reload
  cy.intercept("PUT", `**/drawings/${drawingId}`).as("autoSave");
  injectRectangleAndFiles();
  cy.wait("@autoSave", { timeout: 20000 });
  cy.reload();
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
});

// "the drawing should contain at least {int} element" is defined in shared-drawing-state.steps.ts
