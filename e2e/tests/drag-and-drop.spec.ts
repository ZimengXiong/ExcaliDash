import { test, expect } from "@playwright/test";
import {
  createDrawing,
  deleteDrawing,
  getDrawing,
  listDrawings,
  createCollection,
  deleteCollection,
} from "./helpers/api";

/**
 * E2E Tests for Drag and Drop functionality
 *
 * Covers drag and drop behavior:
 * - Drag drawings into collections
 * - Drag files to import drawings
 * - Drag multiple selected drawings
 */

test.describe("Drag and Drop - Collections", () => {
  let createdDrawingIds: string[] = [];
  let createdCollectionIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {}
    }
    createdDrawingIds = [];

    for (const id of createdCollectionIds) {
      try {
        await deleteCollection(request, id);
      } catch {}
    }
    createdCollectionIds = [];
  });

  test("should move drawing to collection via card menu", async ({
    page,
    request,
  }) => {
    const collection = await createCollection(
      request,
      `DnD_Collection_${Date.now()}`,
    );
    createdCollectionIds.push(collection.id);

    const drawing = await createDrawing(request, {
      name: `DnD_Drawing_${Date.now()}`,
    });
    createdDrawingIds.push(drawing.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();

    await card.hover();

    const collectionPicker = card.locator(
      `[data-testid="collection-picker-${drawing.id}"]`,
    );
    await collectionPicker.click();

    const collectionOption = page.locator(
      `[data-testid="collection-option-${collection.id}"]`,
    );
    await collectionOption.click();

    await expect(collectionPicker).toContainText(collection.name);

    await page
      .getByRole("navigation")
      .getByRole("button", { name: collection.name })
      .click();
    await page.waitForLoadState("networkidle");

    await expect(card).toBeVisible();
  });

  test("should move drawing to Unorganized via card menu", async ({
    page,
    request,
  }) => {
    const collection = await createCollection(
      request,
      `UnorgTest_Collection_${Date.now()}`,
    );
    createdCollectionIds.push(collection.id);

    const drawing = await createDrawing(request, {
      name: `UnorgTest_Drawing_${Date.now()}`,
      collectionId: collection.id,
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/collections?id=${collection.id}`);
    await page.waitForLoadState("networkidle");

    const card = page.locator(`#drawing-card-${drawing.id}`);
    await card.waitFor({ timeout: 10000 });
    await card.hover();

    const collectionPicker = card.locator(
      `[data-testid="collection-picker-${drawing.id}"]`,
    );
    await collectionPicker.click();

    await page.waitForTimeout(300);

    const unorganizedOption = page.locator(
      `[data-testid="collection-option-unorganized"]`,
    );
    await unorganizedOption.click();

    await page.waitForTimeout(500);

    await expect(card).not.toBeVisible({ timeout: 5000 });

    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Unorganized" })
      .click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(`#drawing-card-${drawing.id}`)).toBeVisible();
  });

  test("should move multiple selected drawings to collection via bulk menu", async ({
    page,
    request,
  }) => {
    const collection = await createCollection(
      request,
      `BulkMove_Collection_${Date.now()}`,
    );
    createdCollectionIds.push(collection.id);

    const prefix = `BulkMove_${Date.now()}`;
    const [drawing1, drawing2] = await Promise.all([
      createDrawing(request, { name: `${prefix}_A` }),
      createDrawing(request, { name: `${prefix}_B` }),
    ]);
    createdDrawingIds.push(drawing1.id, drawing2.id);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByPlaceholder("Search drawings...");
    await searchInput.fill(prefix);
    await page.waitForTimeout(500);

    const card1 = page.locator(`#drawing-card-${drawing1.id}`);
    const card2 = page.locator(`#drawing-card-${drawing2.id}`);

    await card1.hover();
    const toggle1 = card1.locator(
      `[data-testid="select-drawing-${drawing1.id}"]`,
    );
    await toggle1.click();

    await card2.hover();
    const toggle2 = card2.locator(
      `[data-testid="select-drawing-${drawing2.id}"]`,
    );
    await toggle2.click();

    const moveButton = page.getByTitle("Move Selected");
    await moveButton.click();

    await page.waitForTimeout(300);
    const collectionOption = page
      .locator(`button:has-text("${collection.name}")`)
      .last();
    await collectionOption.click();

    await page.waitForTimeout(500);

    await page
      .getByRole("navigation")
      .getByRole("button", { name: collection.name })
      .click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(`#drawing-card-${drawing1.id}`)).toBeVisible();
    await expect(page.locator(`#drawing-card-${drawing2.id}`)).toBeVisible();
  });
});

test.describe("Drag and Drop - File Import", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    const drawings = await listDrawings(request, { search: "ImportedDnD" });
    for (const drawing of drawings) {
      try {
        await deleteDrawing(request, drawing.id);
      } catch {}
    }

    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {}
    }
    createdDrawingIds = [];
  });

  test("should show drop zone overlay when dragging files", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("button", { name: /Import/i })).toBeVisible();
    await expect(page.locator("#dashboard-import")).toBeAttached();
  });

  test("should import excalidraw file via file input", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const fileBase = `ImportedDnD_${Date.now()}`;
    const excalidrawContent = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "e2e-test",
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    });

    const fileInput = page.locator("#dashboard-import");
    await fileInput.setInputFiles({
      name: `${fileBase}.excalidraw`,
      mimeType: "application/json",
      buffer: Buffer.from(excalidrawContent),
    });

    await expect
      .poll(
        async () => {
          const drawings = await listDrawings(request, { search: fileBase });
          return drawings.length;
        },
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);

    await page.getByPlaceholder("Search drawings...").fill(fileBase);
    await page.waitForTimeout(700);

    const importedCards = page.locator("[id^='drawing-card-']");
    await expect(importedCards.first()).toBeVisible();
  });
});

test.describe("Drag and Drop - Editor Image Import", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {}
    }
    createdDrawingIds = [];
  });

  test("should import multiple dropped images onto the editor canvas", async ({
    page,
    request,
  }) => {
    const drawing = await createDrawing(request, {
      name: `MultiImageDrop_${Date.now()}`,
    });
    createdDrawingIds.push(drawing.id);

    await page.goto(`/editor/${drawing.id}`);
    await page.waitForFunction(() =>
      Boolean((window as any).__EXCALIDASH_EXCALIDRAW_API__),
    );

    const firstImageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
    const secondImageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEYBxVSFUAAN0HA3D1Ko9eAAAAAElFTkSuQmCC";

    await page.evaluate(
      async ({ firstImageBase64, secondImageBase64 }) => {
        const makeFile = (name: string, base64Data: string) =>
          new File(
            [Uint8Array.from(atob(base64Data), (char) => char.charCodeAt(0))],
            name,
            { type: "image/png" },
          );

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(makeFile("one.png", firstImageBase64));
        dataTransfer.items.add(makeFile("two.png", secondImageBase64));

        const target = document.querySelector(".excalidraw");
        if (!target) {
          throw new Error("Missing Excalidraw container");
        }

        target.dispatchEvent(
          new DragEvent("dragenter", {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          }),
        );
        target.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          }),
        );
        target.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer,
          }),
        );
      },
      { firstImageBase64, secondImageBase64 },
    );

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
            const imageElements = api
              .getSceneElementsIncludingDeleted()
              .filter(
                (element: any) =>
                  !element.isDeleted && element.type === "image",
              );

            return {
              imageCount: imageElements.length,
              fileCount: Object.keys(api.getFiles() || {}).length,
            };
          }),
        { timeout: 15000 },
      )
      .toEqual({ imageCount: 2, fileCount: 2 });

    await expect
      .poll(
        async () => {
          const saved = await getDrawing(request, drawing.id);
          return {
            imageCount: (saved.elements || []).filter(
              (element: any) => !element.isDeleted && element.type === "image",
            ).length,
            fileCount: Object.keys(saved.files || {}).length,
          };
        },
        { timeout: 15000 },
      )
      .toEqual({ imageCount: 2, fileCount: 2 });
  });
});

test.describe("Drag and Drop - Dropped drawings", () => {
  let createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {}
    }
    createdDrawingIds = [];
  });

  const rectangle = (id: string, x: number, y: number, extra = {}) => ({
    id,
    type: "rectangle",
    x,
    y,
    width: 100,
    height: 60,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  });

  // An SVG with an embedded Excalidraw scene, as the "Embed scene" export
  // writes it.
  // It holds two grouped rectangles, so the test can check that the drop
  // gives the group a fresh id.
  const embeddedSceneSvg = () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "e2e",
      elements: [
        rectangle("dropped-a", 0, 0, { groupIds: ["dropped-group"] }),
        rectangle("dropped-b", 150, 0, { groupIds: ["dropped-group"] }),
      ],
      appState: { viewBackgroundColor: "#ffc9c9" },
      files: {},
    };
    const payload = Buffer.from(JSON.stringify(scene)).toString("base64");
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="60">',
      "<!-- svg-source:excalidraw -->",
      "<metadata>",
      "<!-- payload-type:application/vnd.excalidraw+json -->",
      "<!-- payload-version:2 -->",
      "<!-- payload-start -->",
      payload,
      "<!-- payload-end -->",
      "</metadata>",
      "</svg>",
    ].join("");
  };

  const openDrawingWithOneRectangle = async (
    page: import("@playwright/test").Page,
    request: import("@playwright/test").APIRequestContext,
    appendDroppedDrawings: boolean,
  ) => {
    const drawing = await createDrawing(request, {
      name: `DroppedDrawing_${Date.now()}`,
      elements: [rectangle("existing", 0, 0)],
    });
    createdDrawingIds.push(drawing.id);
    // The app overwrites local preferences with the server's once it fetches
    // them.
    // Answer that fetch instead of seeding localStorage, or the shared e2e
    // user's stored value wins, and that value depends on what earlier tests
    // saved.
    await page.route("**/auth/preferences", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        json: { preferences: { appendDroppedDrawings } },
      });
    });
    await page.goto(`/editor/${drawing.id}`);
    await page.waitForFunction(() =>
      Boolean((window as any).__EXCALIDASH_EXCALIDRAW_API__),
    );
    // The app mirrors the preference to localStorage once it applies it.
    // Wait for that before dropping anything.
    await page.waitForFunction(
      (append) =>
        JSON.parse(localStorage.getItem("excalidash-preferences") || "{}")
          .appendDroppedDrawings === append,
      appendDroppedDrawings,
    );
    return drawing;
  };

  const dropSvg = (page: import("@playwright/test").Page, svg: string) =>
    page.evaluate(
      async ({ svgText }) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(
          new File([svgText], "dropped.excalidraw.svg", {
            type: "image/svg+xml",
          }),
        );
        const target = document.querySelector(".excalidraw");
        if (!target) throw new Error("Missing Excalidraw container");
        for (const type of ["dragenter", "dragover", "drop"]) {
          target.dispatchEvent(
            new DragEvent(type, {
              bubbles: true,
              cancelable: true,
              dataTransfer,
            }),
          );
        }
      },
      { svgText: svg },
    );

  const liveElements = (page: import("@playwright/test").Page) =>
    page.evaluate(() =>
      (window as any).__EXCALIDASH_EXCALIDRAW_API__
        .getSceneElementsIncludingDeleted()
        .filter((element: any) => !element.isDeleted)
        .map((element: any) => ({
          id: element.id,
          groupIds: element.groupIds,
        })),
    );

  test("appends a dropped drawing when the setting is on", async ({
    page,
    request,
  }) => {
    const drawing = await openDrawingWithOneRectangle(page, request, true);
    const svg = embeddedSceneSvg();

    await dropSvg(page, svg);
    await expect.poll(async () => (await liveElements(page)).length).toBe(3);
    await dropSvg(page, svg);
    await expect.poll(async () => (await liveElements(page)).length).toBe(5);

    const elements = await liveElements(page);
    const ids = elements.map((element: any) => element.id);
    expect(ids).toContain("existing");
    expect(new Set(ids).size).toBe(5);
    const groups = new Set(
      elements.flatMap((element: any) => element.groupIds),
    );
    expect(groups.size).toBe(2);
    expect(groups.has("dropped-group")).toBe(false);

    await expect
      .poll(
        async () =>
          ((await getDrawing(request, drawing.id)).elements ?? []).filter(
            (element: any) => !element.isDeleted,
          ).length,
        { timeout: 15000 },
      )
      .toBe(5);
  });

  test("replaces the drawing by default", async ({ page, request }) => {
    await openDrawingWithOneRectangle(page, request, false);

    await dropSvg(page, embeddedSceneSvg());

    await expect
      .poll(async () =>
        (await liveElements(page)).map((element: any) => element.id).sort(),
      )
      .toEqual(["dropped-a", "dropped-b"]);
  });
});
