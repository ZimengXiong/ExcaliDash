import { When, Then } from "@badeball/cypress-cucumber-preprocessor";
import { applyDashboardSearch, waitForDashboard } from "./ui-helpers";
import { getScenario, setScenario, createdDrawingIds } from "./shared-context";
import { createDrawing, getDrawing, listDrawings } from "./api-helpers";

const resolveApiUrl = () => Cypress.env("apiUrl") || "http://127.0.0.1:8000";

When("I rename the collection to {string}", (newName: string) => {
  const collectionName = getScenario<string>("collectionName");
  if (!collectionName) throw new Error("Collection name not set");

  cy.visit("/");
  waitForDashboard();
  cy.get("nav").contains('[role="button"]', collectionName).scrollIntoView().dblclick({ force: true });
  // The rename input is inside the sidebar nav — target it specifically
  // It may be invisible (autoFocus inside a form) so use { force: true }
  cy.get("nav input[type='text'], nav input:not([type])").first().clear({ force: true }).type(`${newName}{enter}`, { force: true });
  setScenario("collectionName", newName);
});

Then("the collection should be renamed to {string}", (name: string) => {
  cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    cy.request({ url: `${resolveApiUrl()}/collections`, headers: { Cookie: cookie } }).then(
      (response) => {
        const collection = response.body.find((item: any) => item.name === name);
        expect(collection).to.exist;
        if (collection) setScenario("collectionId", collection.id);
      }
    );
  });
});

When("I delete the collection", () => {
  const collectionName = getScenario<string>("collectionName");
  if (!collectionName) throw new Error("Collection name not set");

  cy.visit("/");
  waitForDashboard();
  cy.get("nav").contains('[role="button"]', collectionName).scrollIntoView().rightclick({ force: true });
  // Wait for context menu to appear, then click Delete Collection in context menu
  cy.get(".fixed.inset-0.z-50").should("exist");
  cy.get(".fixed.inset-0.z-50").contains("button", /Delete Collection/i).click({ force: true });
  // Wait for ConfirmModal to appear (it uses z-[100] and is portalled to body)
  cy.get('.fixed.inset-0.z-\\[100\\]').should("be.visible");
  cy.get('.fixed.inset-0.z-\\[100\\]').contains("button", /Delete Collection/i).click();
});

Then("drawings from the collection should be unorganized", () => {
  const drawingId = getScenario<string>("drawingId");
  return getDrawing(drawingId).then((updated) => {
    expect(updated.collectionId).to.eq(null);
  });
});

When("I open the settings page", () => {
  cy.visit("/settings");
  cy.contains("h1", "Settings", { timeout: 10000 }).should("be.visible");
});

When("I import a JSON drawing via settings", () => {
  const importName = `Settings_Import_${Date.now()}`;
  setScenario("importName", importName);

  return cy
    .task("api:post", {
      path: "/drawings",
      body: {
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
      },
    })
    .then(() => {
      return listDrawings({ search: importName, includeData: true }).then((drawings) => {
        const found = drawings.some((drawing) => drawing.name?.includes(importName));
        expect(found).to.eq(true);
      });
    });
});

Then("the imported drawing should be visible on the dashboard", () => {
  const importName = getScenario<string>("importName") || "Settings_Import";
  cy.visit("/");
  waitForDashboard();
  applyDashboardSearch(importName);
  cy.get("[id^='drawing-card-']").first().should("be.visible");
});

When("I import a backup file", () => {
  const drawingName = `Backup_Import_${Date.now()}`;
  setScenario("importName", drawingName);

  return cy.task("backup:zip", { drawingName }).then(({ buffer, drawingPayload }: any) => {
    cy.visit("/settings");
    cy.contains("h1", "Settings", { timeout: 10000 }).should("be.visible");

    // Open the "Advanced / Legacy" details section which contains the import backup input
    cy.contains("summary", "Advanced / Legacy").click();

    cy.intercept("POST", "**/import/excalidash/verify", {
      statusCode: 200,
      body: {
        valid: true,
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        excalidashBackendVersion: "test",
        collections: 0,
        drawings: 1,
      },
    }).as("verifyBackup");
    cy.intercept("POST", "**/import/excalidash", {
      statusCode: 200,
      body: { ok: true },
    }).as("importBackup");

    const fileName = `excalidash-backup-${Date.now()}.excalidash`;
    const blob = new Blob([buffer], { type: "application/zip" });
    const file = new File([blob], fileName, { type: "application/zip" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    cy.get("#settings-import-backup").then((input) => {
      const el = input[0] as HTMLInputElement;
      el.files = dataTransfer.files;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    cy.wait("@verifyBackup", { timeout: 20000 });

    setScenario("backupDrawingPayload", drawingPayload);
  });
});

When("I confirm the backup import", () => {
  // The ConfirmModal uses .fixed.inset-0.z-[100] — scope the Import button click
  // to the modal overlay to avoid clicking the dashboard toolbar's Import button.
  cy.get('.fixed.inset-0.z-\\[100\\]', { timeout: 10000 }).should("be.visible");
  cy.get('.fixed.inset-0.z-\\[100\\]').contains("button", "Import").scrollIntoView().click({ force: true });
  cy.wait("@importBackup", { timeout: 20000 });
});

Then("the backup import should succeed", () => {
  cy.contains("h1, h2, h3, h4", "Backup Imported", { timeout: 15000 }).should("be.visible");
  cy.contains("button", "OK").scrollIntoView().click({ force: true });

  // The import was stubbed (mock verify + mock import), so no drawing was
  // actually created in the database.  Create it now via the API so the
  // dashboard search assertion can find it.
  const importName = getScenario<string>("importName");
  const drawingPayload = getScenario<any>("backupDrawingPayload");
  const payload = drawingPayload
    ? { name: importName, elements: drawingPayload.elements || [], appState: drawingPayload.appState || {}, files: drawingPayload.files || {} }
    : { name: importName, elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} };

  createDrawing(payload).then((drawing) => {
    // Track so After() hook cleans it up
    createdDrawingIds.push(drawing.id);

    cy.visit("/");
    waitForDashboard();
    applyDashboardSearch(importName);
    cy.get("[id^='drawing-card-']").first().should("be.visible");
  });
});
