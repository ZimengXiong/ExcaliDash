import { When, Then } from "@badeball/cypress-cucumber-preprocessor";
import {
  listCollections,
  listDrawings,
  getDrawing,
  deleteDrawing,
  type DrawingRecord,
} from "./api-helpers";
import { applyDashboardSearch, ensureCardSelected, ensureCardVisible, waitForDashboard } from "./ui-helpers";
import { createdCollectionIds, createdDrawingIds, getScenario, setScenario } from "./shared-context";

When("I create a collection named {string}", (name: string) => {
  cy.visit("/");
  waitForDashboard();

  cy.get('[title="New Collection"]').click({ force: true });
  cy.get('input[placeholder="New Collection..."]').should("exist").type(`${name}{enter}`, { force: true });

  return listCollections().then((collections) => {
    const created = collections.find((collection) => collection.name === name);
    expect(created).to.exist;
    if (created && !createdCollectionIds.includes(created.id)) {
      createdCollectionIds.push(created.id);
    }
    if (created) {
      setScenario("collectionId", created.id);
      setScenario("collectionName", name);
    }
  });
});

When("I move the drawing into collection {string}", (collectionName: string) => {
  const drawingId = getScenario<string>("drawingId");
  return listCollections().then((collections) => {
    const collection = collections.find((item) => item.name === collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} not found`);

    cy.visit("/");
    waitForDashboard();
    ensureCardVisible(drawingId);
    cy.get(`[data-testid="collection-picker-${drawingId}"]`).scrollIntoView().click({ force: true });
    cy.get(`[data-testid="collection-option-${collection.id}"]`).click();
    cy.get(`[data-testid="collection-picker-${drawingId}"]`).should("contain.text", collectionName);

    return getDrawing(drawingId).then((updated) => {
      expect(updated.collectionId).to.eq(collection.id);
    });
  });
});

When(
  "I move the drawing into collection {string} using the card menu",
  (collectionName: string) => {
    const drawingId = getScenario<string>("drawingId");
    return listCollections().then((collections) => {
      const collection = collections.find((item) => item.name === collectionName);
      if (!collection) throw new Error(`Collection ${collectionName} not found`);

      cy.visit("/");
      waitForDashboard();
      ensureCardVisible(drawingId).trigger("mouseover");
      cy.get(`[data-testid="collection-picker-${drawingId}"]`).scrollIntoView().click({ force: true });
      cy.get(`[data-testid="collection-option-${collection.id}"]`).click();
      cy.get(`[data-testid="collection-picker-${drawingId}"]`).should("contain.text", collectionName);
    });
  }
);

When(
  "I move the drawing into collection {string} using the bulk menu",
  (collectionName: string) => {
    const drawings = [...createdDrawingIds];
    return listCollections().then((collections) => {
      const collection = collections.find((item) => item.name === collectionName);
      if (!collection) throw new Error(`Collection ${collectionName} not found`);

      cy.visit("/");
      waitForDashboard();
      applyDashboardSearch("");

      drawings.forEach((id) => ensureCardSelected(id));
      cy.get('[title="Move Selected"]').click({ force: true });
      cy.contains("button", collection.name).click();

      return Cypress.Promise.all(drawings.map((id) => getDrawing(id))).then((updated) => {
        const ok = updated.every((drawing) => drawing.collectionId === collection.id);
        expect(ok).to.eq(true);
      });
    });
  }
);

When("I duplicate the drawings in bulk", () => {
  cy.visit("/");
  waitForDashboard();
  createdDrawingIds.forEach((id) => ensureCardSelected(id));
  cy.get('[title="Duplicate Selected"]').click({ force: true });
  cy.wait(1000);
});

When("I move the duplicated drawings to trash", () => {
  const searchPrefix = getScenario<string>("drawingPrefix") || "";
  cy.visit("/");
  waitForDashboard();
  applyDashboardSearch(searchPrefix);

  return listDrawings({ search: searchPrefix }).then((results) => {
    // Wait for the UI to show at least as many cards as the API returned
    cy.get("[id^='drawing-card-']", { timeout: 15000 }).should("have.length.gte", results.length);
    results.forEach((drawing) => ensureCardSelected(drawing.id));
    cy.get('[title="Move to Trash"]').click({ force: true });
    cy.wait(1000);
  });
});

Then("the drawing should appear in collection {string}", (collectionName: string) => {
  const collectionId = getScenario<string>("collectionId");
  const drawingId = getScenario<string>("drawingId");

  cy.get("nav").contains('[role="button"]', collectionName).scrollIntoView().click({ force: true });
  cy.get(`#drawing-card-${drawingId}`).should("be.visible");
  return getDrawing(drawingId).then((updated) => {
    expect(updated.collectionId).to.eq(collectionId);
  });
});

Then("the drawing should not appear in the unorganized view", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.get("nav").contains('[role="button"]', "Unorganized").scrollIntoView().click({ force: true });
  cy.get(`#drawing-card-${drawingId}`).should("not.exist");
});

Then(
  "{int} drawings named {string} should be in the trash",
  (count: number, prefix: string) => {
    const expectedMin = Math.max(2, count - 2);
    return listDrawings({ search: prefix, collectionId: "trash" }).then((trashed) => {
      expect(trashed.length).to.be.gte(expectedMin);
      return Cypress.Promise.all(
        trashed.map((drawing) => deleteDrawing(drawing.id))
      ).then(() => {
        const removedIds = new Set(trashed.map((drawing) => drawing.id));
        for (let i = createdDrawingIds.length - 1; i >= 0; i -= 1) {
          if (removedIds.has(createdDrawingIds[i])) createdDrawingIds.splice(i, 1);
        }
      });
    });
  }
);

When("I select all drawings using the keyboard", () => {
  cy.visit("/");
  waitForDashboard();
  applyDashboardSearch("");
  cy.get("body").type(Cypress.platform === "darwin" ? "{meta}a" : "{ctrl}a");
});

Then("all drawings should be selected", () => {
  cy.get('[data-testid^="select-drawing-"]').then(($toggles) => {
    const total = $toggles.length;
    expect(total).to.be.greaterThan(0);
    cy.get('[data-testid^="select-drawing-"][aria-pressed="true"]').should(
      "have.length",
      total
    );
  });
});

When("I clear the selection with escape", () => {
  cy.get("body").type("{esc}");
});

Then("no drawings should be selected", () => {
  cy.get('[data-testid^="select-drawing-"][aria-pressed="true"]').should("have.length", 0);
});
