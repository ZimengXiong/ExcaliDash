import { Given, When, Then } from "@badeball/cypress-cucumber-preprocessor";
import {
  createDrawing,
  getDrawing,
  listDrawings,
} from "./api-helpers";
import { applyDashboardSearch, ensureCardSelected, waitForDashboard } from "./ui-helpers";
import { createdDrawingIds, getScenario, setScenario } from "./shared-context";

const waitForDrawingSave = (drawingId: string) => {
  cy.intercept("PUT", `**/drawings/${drawingId}`).as("saveDrawing");
  cy.wait("@saveDrawing", { timeout: 20000 });
};

Given("a drawing in the trash named {string}", (name: string) => {
  return createDrawing({ name, collectionId: "trash" }).then((drawing) => {
    createdDrawingIds.push(drawing.id);
    setScenario("drawingId", drawing.id);
  });
});

When("I create a new drawing", () => {
  cy.findByRole("button", { name: /New Drawing/i }).click();
  cy.location("pathname", { timeout: 15000 }).should("include", "/editor/");
  cy.url().then((url) => {
    const match = url.match(/\/editor\/([^/]+)/);
    if (!match) throw new Error("Drawing ID not found in URL");
    setScenario("drawingId", match[1]);
    createdDrawingIds.push(match[1]);
  });
});

Then("I should see the editor for that drawing", () => {
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
});

Then("the drawing should be stored with the name {string}", (name: string) => {
  const drawingId = getScenario<string>("drawingId");
  return getDrawing(drawingId).then((drawing) => {
    expect(drawing.name).to.eq(name);
  });
});

When("I open the drawing from the dashboard", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit("/");
  waitForDashboard();
  applyDashboardSearch("");
  cy.get(`#drawing-card-${drawingId}`).click();
});

When("I rename the drawing to {string} in the editor header", (newName: string) => {
  const drawingId = getScenario<string>("drawingId");
  return getDrawing(drawingId).then((drawing) => {
    cy.visit(`/editor/${drawingId}`);
    cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
    cy.contains(drawing.name).dblclick();
    cy.get("input").first().clear().type(`${newName}{enter}`);
    waitForDrawingSave(drawingId);
  });
});

Then("the drawing name should be {string}", (newName: string) => {
  const drawingId = getScenario<string>("drawingId");
  return getDrawing(drawingId).then((drawing) => {
    expect(drawing.name).to.eq(newName);
  });
});

When("I return to the dashboard from the editor", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit(`/editor/${drawingId}`);
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
  cy.get("header button").first().click();
  cy.location("pathname").should("eq", "/");
});

Then("I should see the dashboard search input", () => {
  cy.get('input[placeholder="Search drawings..."]').should("be.visible");
});

When("I draw a rectangle on the canvas", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit(`/editor/${drawingId}`);
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
  // Inject element via Excalidraw API for reliable headless/Docker operation
  cy.window().then((win: any) => {
    const api = win.__EXCALIDASH_EXCALIDRAW_API__;
    if (!api) throw new Error("Missing __EXCALIDASH_EXCALIDRAW_API__");
    const now = Date.now();
    const element = {
      id: `bdd-rect-${now}`,
      type: "rectangle",
      x: 300,
      y: 300,
      width: 200,
      height: 150,
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
      seed: now,
      version: 1,
      versionNonce: now + 1,
      isDeleted: false,
      boundElements: null,
      updated: now,
      link: null,
      locked: false,
    };
    const elements = api.getSceneElementsIncludingDeleted();
    api.updateScene({ elements: [...elements, element] });
  });
  waitForDrawingSave(drawingId);
});

When("I draw text {string} on the canvas", (text: string) => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit(`/editor/${drawingId}`);
  cy.get("canvas.excalidraw__canvas.interactive", { timeout: 15000 }).should("be.visible");
  // Inject text element via Excalidraw API for reliable headless/Docker operation
  cy.window().then((win: any) => {
    const api = win.__EXCALIDASH_EXCALIDRAW_API__;
    if (!api) throw new Error("Missing __EXCALIDASH_EXCALIDRAW_API__");
    const now = Date.now();
    const element = {
      id: `bdd-text-${now}`,
      type: "text",
      x: 400,
      y: 400,
      width: 200,
      height: 25,
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
      roundness: null,
      seed: now,
      version: 1,
      versionNonce: now + 1,
      isDeleted: false,
      boundElements: null,
      updated: now,
      link: null,
      locked: false,
      text,
      fontSize: 20,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: null,
      originalText: text,
      autoResize: true,
      lineHeight: 1.25,
    };
    const elements = api.getSceneElementsIncludingDeleted();
    api.updateScene({ elements: [...elements, element] });
  });
  waitForDrawingSave(drawingId);
});

When("I undo and redo the change", () => {
  if (Cypress.platform === "darwin") {
    cy.get("body").type("{meta}z");
    cy.get("body").type("{meta}{shift}z");
  } else {
    cy.get("body").type("{ctrl}z");
    cy.get("body").type("{ctrl}{shift}z");
  }
});

Then("the editor should remain responsive", () => {
  cy.get("canvas.excalidraw__canvas.interactive").should("be.visible");
});

When("I move the drawing to the trash", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit("/");
  waitForDashboard();
  cy.get(`#drawing-card-${drawingId}`).trigger("mouseover");
  cy.get(`[data-testid="select-drawing-${drawingId}"]`).click({ force: true });
  cy.get('[title="Move to Trash"]').click({ force: true });
});

Then("the drawing should appear in the trash view", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.findByRole("button", { name: /^Trash$/ }).scrollIntoView().click({ force: true });
  cy.get(`#drawing-card-${drawingId}`).should("be.visible");
});

When("I permanently delete the drawing from the trash", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit("/?view=trash");
  cy.findByRole("button", { name: /^Trash$/ }).scrollIntoView().click({ force: true });
  cy.get(`#drawing-card-${drawingId}`).trigger("mouseover");
  cy.get(`[data-testid="select-drawing-${drawingId}"]`).click({ force: true });
  cy.get('[title="Delete Permanently"]').click({ force: true });
  cy.findByRole("button", { name: /Delete \d+ Drawings?/i }).click();
});

Then("the drawing should be removed from the system", () => {
  const drawingId = getScenario<string>("drawingId");
  const apiUrl = Cypress.env("apiUrl") || "http://127.0.0.1:8000";
  cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    cy.request({
      url: `${apiUrl}/drawings/${drawingId}`,
      headers: { Cookie: cookie },
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(404);
    });
  });
});

When("I duplicate the drawing from the dashboard", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit("/");
  waitForDashboard();
  cy.get(`#drawing-card-${drawingId}`).trigger("mouseover");
  cy.get(`[data-testid="select-drawing-${drawingId}"]`).click({ force: true });
  cy.intercept("POST", `**/drawings/${drawingId}/duplicate`).as("duplicate");
  cy.get('[title="Duplicate Selected"]').click({ force: true });
  cy.wait("@duplicate", { timeout: 15000 });
});

Then("I should see two drawings matching {string}", (namePrefix: string) => {
  return listDrawings({ search: namePrefix }).then((results) => {
    expect(results.length).to.be.gte(2);
    results.forEach((drawing) => {
      if (!createdDrawingIds.includes(drawing.id)) {
        createdDrawingIds.push(drawing.id);
      }
    });
  });
});

When("I export the drawing from its card menu", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit("/");
  waitForDashboard();
  cy.get(`#drawing-card-${drawingId}`).rightclick();
  cy.findByRole("button", { name: /^Export$/i }).click();
  cy.contains(/Failed to export drawing/i).should("not.exist");
});

Then("the export should complete without error", () => {
  cy.contains(/Failed to export drawing/i).should("not.exist");
});

When("I move the drawing to the trash using bulk actions", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit("/");
  waitForDashboard();
  applyDashboardSearch("");
  ensureCardSelected(drawingId);
  cy.get('[title="Move to Trash"]').click({ force: true });
});
