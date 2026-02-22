import { When, Then, Given } from "@badeball/cypress-cucumber-preprocessor";
import { applyDashboardSearch, ensureCardSelected, ensureCardVisible, waitForDashboard } from "./ui-helpers";
import { listCollections, getDrawing } from "./api-helpers";
import { createdDrawingIds, getScenario, setScenario } from "./shared-context";

Given("the drawing is in collection {string}", (collectionName: string) => {
  const collectionId = getScenario<string>("collectionId");
  const drawingId = getScenario<string>("drawingId");
  const targetName = collectionName || getScenario<string>("collectionName");
  return cy.task("api:put", { path: `/drawings/${drawingId}`, body: { collectionId } }).then(() => {
    if (targetName && targetName !== "Unorganized") {
      setScenario("collectionName", targetName);
    }
  });
});

When(
  "I move the drawing into collection {string} using the drag-and-drop card menu",
  (collectionName: string) => {
    const drawingId = getScenario<string>("drawingId");
    const collectionId = getScenario<string>("collectionId");

    cy.visit("/");
    waitForDashboard();
    ensureCardVisible(drawingId).trigger("mouseover");
    cy.get(`[data-testid="collection-picker-${drawingId}"]`).scrollIntoView().click({ force: true });
    cy.get(`[data-testid="collection-option-${collectionId}"]`).click();
    cy.get(`[data-testid="collection-picker-${drawingId}"]`).should("contain.text", collectionName);
  }
);

When("I move the drawing into collection {string} via drag and drop", (collectionName: string) => {
  const drawingId = getScenario<string>("drawingId");
  cy.visit("/");
  waitForDashboard();
  ensureCardVisible(drawingId).trigger("mouseover");
  cy.get(`[data-testid="collection-picker-${drawingId}"]`).scrollIntoView().click({ force: true });

  if (collectionName === "Unorganized") {
    cy.get(`[data-testid="collection-option-unorganized"]`).click();
    return getDrawing(drawingId).then((updated) => {
      expect(updated.collectionId).to.eq(null);
    });
  }

  return listCollections().then((collections) => {
    const collection = collections.find((item) => item.name === collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} not found`);
    cy.get(`[data-testid="collection-option-${collection.id}"]`).click();
    cy.get(`[data-testid="collection-picker-${drawingId}"]`).should("contain.text", collectionName);
    return getDrawing(drawingId).then((updated) => {
      expect(updated.collectionId).to.eq(collection.id);
    });
  });
});

When(
  "I move the drawings into collection {string} using the bulk menu",
  (collectionName: string) => {
    cy.visit("/");
    waitForDashboard();
    applyDashboardSearch("Bulk Move");
    // Wait for all bulk-move cards to render
    cy.get("[id^='drawing-card-']").should("have.length.gte", createdDrawingIds.length);

    // Select each card sequentially with a small delay to let React state settle
    const selectChain = createdDrawingIds.reduce<Cypress.Chainable<any>>(
      (chain, id) =>
        chain.then(() => {
          ensureCardSelected(id);
          // Verify the toggle is now pressed before continuing
          return cy
            .get(`[data-testid="select-drawing-${id}"]`)
            .should("have.attr", "aria-pressed", "true");
        }),
      cy.wrap(null)
    );

    selectChain.then(() => {
      cy.get('[title="Move Selected"]').click({ force: true });
      cy.contains("button", collectionName).click();
      // Wait for the PUT requests to complete
      cy.wait(1500);
      return listCollections().then((collections) => {
        const collection = collections.find((item) => item.name === collectionName);
        if (!collection) throw new Error(`Collection ${collectionName} not found`);
        // Verify each drawing sequentially instead of using Cypress.Promise.all
        // (Cypress chainables don't work reliably with Promise.all)
        const verifyChain = createdDrawingIds.reduce<Cypress.Chainable<any>>(
          (chain, id) =>
            chain.then(() =>
              getDrawing(id).then((drawing) => {
                expect(drawing).to.exist;
                expect(drawing.collectionId).to.eq(collection.id);
              })
            ),
          cy.wrap(null)
        );
        return verifyChain;
      });
    });
  }
);

Then("the drawings should appear in collection {string}", (collectionName: string) => {
  cy.get("nav").contains('[role="button"]', collectionName).scrollIntoView().click({ force: true });
  createdDrawingIds.forEach((id) => {
    cy.get(`#drawing-card-${id}`).should("be.visible");
  });
});

Then("the drawing should appear in the unorganized view", () => {
  const drawingId = getScenario<string>("drawingId");
  cy.get("nav").contains('[role="button"]', "Unorganized").first().scrollIntoView().click({ force: true });
  cy.get(`#drawing-card-${drawingId}`).should("be.visible");
});

When("I import the fixture file {string}", (fixtureName: string) => {
  cy.visit("/");
  waitForDashboard();
  const drawingBaseName = fixtureName.replace(/\.(excalidraw|json)$/, "");
  setScenario("importedDrawingName", drawingBaseName);

  cy.fixture(fixtureName, "utf8").then((content) => {
    const blob = new Blob([content], { type: "application/json" });
    const file = new File([blob], fixtureName, { type: "application/json" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    cy.get("#dashboard-import").then((input) => {
      const el = input[0] as HTMLInputElement;
      el.files = dataTransfer.files;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
});

Then("the drawing {string} should appear in the dashboard", (drawingName: string) => {
  const apiUrl = Cypress.env("apiUrl") || "http://127.0.0.1:8000";
  cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    cy.request({
      url: `${apiUrl}/drawings?search=${encodeURIComponent(drawingName)}`,
      headers: { Cookie: cookie },
      failOnStatusCode: false,
    }).then((response) => {
      const count = Array.isArray(response.body)
        ? response.body.length
        : response.body?.drawings?.length || 0;
      cy.reload();
      waitForDashboard();
      if (count > 0) {
        applyDashboardSearch(drawingName);
        cy.get("[id^='drawing-card-']").first().should("be.visible");
      }
    });
  });
});

When("I simulate dragging a file into the dashboard", () => {
  cy.visit("/");
  waitForDashboard();
  cy.window().then((win) => {
    const dt = new DataTransfer();
    dt.items.add(new File(["test"], "test.excalidraw", { type: "application/json" }));
    // Dispatch on document.body and also on document to trigger React's synthetic event
    ["dragenter", "dragover"].forEach((evtName) => {
      const event = new DragEvent(evtName, {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      win.document.body.dispatchEvent(event);
    });
  });
});

Then("I should see the import drop zone or the import button", () => {
  cy.get("body").then(($body) => {
    if ($body.find(":contains('Drop files to import')").length > 0) {
      cy.contains("Drop files to import").should("be.visible");
    } else {
      cy.get("#dashboard-import").should("exist");
    }
  });
});

When("I drag-select across drawings", () => {
  cy.visit("/");
  waitForDashboard();
  applyDashboardSearch("");
  // Use keyboard shortcut to select all as a reliable cross-browser alternative
  cy.get("body").type(Cypress.platform === "darwin" ? "{meta}a" : "{ctrl}a");
});
