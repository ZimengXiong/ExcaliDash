import { When, Then } from "@badeball/cypress-cucumber-preprocessor";
import { createDrawing, getDrawing, getCsrfInfo } from "./api-helpers";
import { createdDrawingIds, getScenario, setScenario } from "./shared-context";

const generateLargeImageDataUrl = (sizeInBytes = 50000): string => {
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64Data = "";
  for (let i = 0; i < sizeInBytes; i += 1) {
    base64Data += base64Chars[Math.floor(Math.random() * 64)];
  }
  return `data:image/png;base64,${base64Data}`;
};

When("I create a drawing with a large image", () => {
  const largeDataUrl = generateLargeImageDataUrl(50000);
  const files = {
    "test-image-1": {
      id: "test-image-1",
      mimeType: "image/png",
      dataURL: largeDataUrl,
      created: Date.now(),
    },
  };

  return createDrawing({ name: "BDD Large Image", files }).then((created) => {
    createdDrawingIds.push(created.id);
    setScenario("drawingId", created.id);
    setScenario("largeImageUrl", largeDataUrl);
  });
});

Then("the drawing should preserve the image data", () => {
  const drawingId = getScenario<string>("drawingId");
  const largeDataUrl = getScenario<string>("largeImageUrl");
  return getDrawing(drawingId).then((drawing) => {
    const savedFiles = drawing.files || {};
    expect(savedFiles["test-image-1"]).to.exist;
    expect(savedFiles["test-image-1"].dataURL).to.eq(largeDataUrl);
    expect(savedFiles["test-image-1"].dataURL.length).to.eq(largeDataUrl.length);
  });
});

When("I import an image fixture drawing", () => {
  return cy.fixture("small-image.excalidraw", "utf8").then((fixtureContent) => {
    const fixtureData = JSON.parse(fixtureContent);
    return createDrawing({ name: "BDD Imported Image", files: fixtureData.files }).then(
      (created) => {
        createdDrawingIds.push(created.id);
        setScenario("drawingId", created.id);
        setScenario("fixtureFiles", fixtureData.files);
      }
    );
  });
});

Then("the drawing should preserve the embedded image", () => {
  const drawingId = getScenario<string>("drawingId");
  const fixtureFiles = getScenario<Record<string, any>>("fixtureFiles");
  return getDrawing(drawingId).then((drawing) => {
    const savedFiles = drawing.files || {};
    expect(savedFiles["embedded-test-image"]).to.exist;
    expect(savedFiles["embedded-test-image"].dataURL).to.eq(
      fixtureFiles["embedded-test-image"].dataURL
    );
  });
});

When("I create a drawing with multiple image sizes", () => {
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

  return createDrawing({ name: "BDD Multi Image", files }).then((created) => {
    createdDrawingIds.push(created.id);
    setScenario("drawingId", created.id);
    setScenario("multipleFiles", files);
  });
});

Then("the drawing should preserve all images", () => {
  const drawingId = getScenario<string>("drawingId");
  const files = getScenario<Record<string, any>>("multipleFiles");
  return getDrawing(drawingId).then((drawing) => {
    const savedFiles = drawing.files || {};
    Object.entries(files).forEach(([id, originalFile]) => {
      expect(savedFiles[id]).to.exist;
      expect(savedFiles[id].dataURL).to.eq((originalFile as any).dataURL);
      expect(savedFiles[id].dataURL.length).to.eq((originalFile as any).dataURL.length);
    });
  });
});

When("I submit a drawing with a javascript image URL", () => {
  const maliciousFiles = {
    "malicious-image": {
      id: "malicious-image",
      mimeType: "image/png",
      dataURL: "javascript:alert('xss')",
      created: Date.now(),
    },
  };

  return cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    return getCsrfInfo().then((csrf) =>
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl") || "http://127.0.0.1:8000"}/drawings`,
        headers: {
          [csrf.header]: csrf.token,
          Cookie: cookie,
        },
        body: {
          name: "Security Test - JS URL",
          elements: [],
          appState: { viewBackgroundColor: "#ffffff" },
          files: maliciousFiles,
          preview: null,
        },
      }).then((response) => {
        expect(response.status).to.eq(200);
        setScenario("maliciousDrawing", response.body);
        createdDrawingIds.push(response.body.id);
      })
    );
  });
});

When("I submit a drawing with a script tag in image data", () => {
  const maliciousFiles = {
    "malicious-image": {
      id: "malicious-image",
      mimeType: "image/png",
      dataURL: "data:image/png;base64,<script>alert('xss')</script>AAAA",
      created: Date.now(),
    },
  };

  return cy.task("auth:login").then(({ cookieHeader, csrfCookie }: any) => {
    const cookie = [cookieHeader, csrfCookie].filter(Boolean).join("; ");
    return getCsrfInfo().then((csrf) =>
      cy.request({
        method: "POST",
        url: `${Cypress.env("apiUrl") || "http://127.0.0.1:8000"}/drawings`,
        headers: {
          [csrf.header]: csrf.token,
          Cookie: cookie,
        },
        body: {
          name: "Security Test - Script Tag",
          elements: [],
          appState: { viewBackgroundColor: "#ffffff" },
          files: maliciousFiles,
          preview: null,
        },
      }).then((response) => {
        expect(response.status).to.eq(200);
        setScenario("maliciousDrawing", response.body);
        createdDrawingIds.push(response.body.id);
      })
    );
  });
});

Then("the image data should be sanitized", () => {
  const drawing = getScenario<any>("maliciousDrawing");
  const savedFiles = drawing.files;
  expect(savedFiles["malicious-image"].dataURL).to.not.contain("javascript:");
  expect(savedFiles["malicious-image"].dataURL).to.not.contain("<script>");
});
