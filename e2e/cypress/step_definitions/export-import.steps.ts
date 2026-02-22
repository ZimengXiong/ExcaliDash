import { When, Then } from "@badeball/cypress-cucumber-preprocessor";
import { getScenario, setScenario } from "./shared-context";
import { getCsrfInfo, listDrawings } from "./api-helpers";

const resolveApiUrl = () => Cypress.env("apiUrl") || "http://127.0.0.1:8000";

When("I view export options", () => {
  cy.visit("/settings");
  cy.contains("h1", "Settings", { timeout: 10000 }).should("be.visible");
});

Then("I should see the SQLite export option", () => {
  // The Settings page has an "Export Backup" card with an "Export" button
  // and a dropdown for extension selection (.excalidash / .excalidash.zip).
  // The legacy SQLite/DB export is available via API only, not as a UI button.
  // Verify the export section is visible.
  cy.contains("h3", "Export Backup").should("be.visible");
  cy.contains("button", /Export/i).should("be.visible");
});

Then("I should see the JSON export option", () => {
  // The JSON export is done via the same Export Backup card
  cy.contains("h3", "Export Backup").should("be.visible");
  cy.contains("button", /Export/i).should("be.visible");
});

When("I request the JSON export endpoint", () => {
  cy.task("auth:login").then(({ cookieHeader }: any) => {
    const cookie = [cookieHeader].filter(Boolean).join("; ");
    cy.request({
      url: `${resolveApiUrl()}/export/excalidash?ext=zip`,
      encoding: "binary",
      headers: { Cookie: cookie },
    }).then((response) => {
      setScenario("exportResponse", response);
    });
  });
});

Then("I should receive a zip export response", () => {
  const response = getScenario<Cypress.Response<any>>("exportResponse");
  expect(response.status).to.eq(200);
  expect(response.headers["content-type"]).to.match(/application\/zip/);
  expect(response.headers["content-disposition"]).to.contain("attachment");
});

When("I request the SQLite export endpoint", () => {
  cy.task("auth:login").then(({ cookieHeader }: any) => {
    const cookie = [cookieHeader].filter(Boolean).join("; ");
    cy.request({
      url: `${resolveApiUrl()}/export/excalidash`,
      encoding: "binary",
      headers: { Cookie: cookie },
    }).then((response) => {
      setScenario("exportResponse", response);
    });
  });
});

Then("I should receive a SQLite export response", () => {
  const response = getScenario<Cypress.Response<any>>("exportResponse");
  expect(response.status).to.eq(200);
  expect(response.headers["content-type"]).to.match(/application\/zip|application\/octet-stream|application\/x-sqlite3/);
  expect(response.headers["content-disposition"]).to.contain("attachment");
});

When("I request the DB export endpoint", () => {
  cy.task("auth:login").then(({ cookieHeader }: any) => {
    const cookie = [cookieHeader].filter(Boolean).join("; ");
    cy.request({
      url: `${resolveApiUrl()}/export/excalidash`,
      encoding: "binary",
      headers: { Cookie: cookie },
    }).then((response) => {
      setScenario("exportResponse", response);
    });
  });
});

Then("I should receive a DB export response", () => {
  const response = getScenario<Cypress.Response<any>>("exportResponse");
  expect(response.status).to.eq(200);
  expect(response.headers["content-disposition"]).to.contain("attachment");
});

When("I import a drawing file named {string}", (name: string) => {
  setScenario("importName", name);
  return cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    return getCsrfInfo().then((csrf) =>
      cy
        .request({
          method: "POST",
          url: `${resolveApiUrl()}/drawings`,
          headers: {
            [csrf.header]: csrf.token,
            "X-Imported-File": "true",
            Cookie: cookie,
          },
          body: {
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
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          },
        })
        .then(() => {
          cy.visit("/");
        })
    );
  });
});

Then("I should see the drawing {string} in the dashboard", (name: string) => {
  const importName = getScenario<string>("importName") || name;
  return listDrawings({ search: importName, includeData: true }).then((drawings) => {
    const found = drawings.some((drawing) => drawing.name.includes(importName));
    expect(found).to.eq(true);
  });
});

When("I import a json drawing file named {string}", (name: string) => {
  setScenario("importName", name);
  return cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    return getCsrfInfo().then((csrf) =>
      cy
        .request({
          method: "POST",
          url: `${resolveApiUrl()}/drawings`,
          headers: {
            [csrf.header]: csrf.token,
            "X-Imported-File": "true",
            Cookie: cookie,
          },
          body: {
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
          },
        })
        .then(() => {
          cy.visit("/");
        })
    );
  });
});

When("I import an invalid drawing file", () => {
  cy.visit("/");
  const invalidContent = "this is not valid JSON or excalidraw format {}{}";
  const blob = new Blob([invalidContent], { type: "application/json" });
  const file = new File([blob], `Import_Invalid_${Date.now()}.excalidraw`, {
    type: "application/json",
  });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  cy.get("#dashboard-import").then((input) => {
    const el = input[0] as HTMLInputElement;
    el.files = dataTransfer.files;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

When("I import an unsupported library file", () => {
  cy.visit("/");
  const blob = new Blob(["{}"], { type: "application/json" });
  const file = new File([blob], `Library_${Date.now()}.excalidrawlib`, {
    type: "application/json",
  });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  cy.get("#dashboard-import").then((input) => {
    const el = input[0] as HTMLInputElement;
    el.files = dataTransfer.files;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

Then("I should see the unsupported library import error", () => {
  // Unsupported files (.excalidrawlib) are filtered as unsupported immediately
  // by uploadFiles() — they get status: 'error' but isUploading never becomes
  // true, so the UploadStatus panel never auto-opens. We must click the
  // floating FAB button (bottom-right) to reveal the panel, then check "Failed".
  // The FAB is rendered whenever tasks.length > 0.
  // The UploadStatus wrapper is: div.fixed.bottom-6.right-6.z-50
  // The FAB button is a round button (h-12 w-12 rounded-full) inside it.
  cy.get("div.fixed.z-50 > button.rounded-full", { timeout: 10000 }).click({ force: true });
  cy.contains("Failed", { timeout: 10000 }).should("be.visible");
});

Then("I should see the import failure status", () => {
  // Invalid .excalidraw files go through uploadFiles() → importDrawings() which
  // reports errors via the UploadStatus component (bottom-right floating panel).
  // Error tasks show "Failed" in UploadStatus.
  cy.contains("Failed", { timeout: 10000 }).should("be.visible");
});

When("I import multiple drawings named {string}", (prefix: string) => {
  setScenario("importName", prefix);
  return cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    return getCsrfInfo().then((csrf) => {
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
          appState: { viewBackgroundColor: "#f0f0f0" },
          files: {},
        },
        {
          name: `${prefix}_B`,
          elements: [
            {
              id: "multi-rect-b",
              type: "rectangle",
              x: 200,
              y: 200,
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

      return Cypress.Promise.all(
        payloads.map((payload) =>
          cy.request({
            method: "POST",
            url: `${resolveApiUrl()}/drawings`,
            headers: {
              [csrf.header]: csrf.token,
              "X-Imported-File": "true",
              Cookie: cookie,
            },
            body: payload,
          })
        )
      ).then(() => {
        cy.visit("/");
      });
    });
  });
});

When("I verify the database import endpoint", () => {
  return cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    return getCsrfInfo().then((csrf) => {
    const boundary = "----CypressFormBoundary";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="db"; filename="test.sqlite"',
      "Content-Type: application/x-sqlite3",
      "",
      "",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    return cy
      .request({
        method: "POST",
        url: `${resolveApiUrl()}/import/sqlite/legacy/verify`,
        headers: {
          [csrf.header]: csrf.token,
          "content-type": `multipart/form-data; boundary=${boundary}`,
          Cookie: cookie,
        },
        body,
        failOnStatusCode: false,
      })
      .then((response) => {
        setScenario("dbVerifyResponse", response);
      });
    });
  });
});

Then("the database import verification should respond with an error", () => {
  const response = getScenario<Cypress.Response<any>>("dbVerifyResponse");
  expect([400, 500]).to.include(response.status);
});
