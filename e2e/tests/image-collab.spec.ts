import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createDrawing, deleteDrawing, getDrawing, updateDrawing } from "./helpers/api";

/**
 * Regression tests for:
 * - Issue #25: pasted image doesn't load in other tabs
 * - Follow-up: deleting the image in one tab should remove it from all tabs
 *
 * NOTE:
 * We drive the editor via Excalidraw's API (exposed in dev/test builds) to make
 * the test deterministic and to specifically model the async "element first,
 * file data later" behavior seen with paste/import.
 */

const waitForEditorReady = async (page: Page) => {
  await page.goto(page.url() || "/");
  // Excalidraw renders a canvas; this is our "loaded" signal.
  await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  await page.waitForFunction(() => {
    // @ts-expect-error - injected in dev build
    return !!(window as any).__EXCALIDASH_EXCALIDRAW_API__;
  });
};

const openEditorTab = async (context: BrowserContext, drawingId: string) => {
  const page = await context.newPage();
  await page.goto(`/editor/${drawingId}`);
  await page.waitForSelector("[class*='excalidraw'], canvas", { timeout: 15000 });
  await page.waitForFunction(() => {
    // @ts-expect-error - injected in dev build
    return !!(window as any).__EXCALIDASH_EXCALIDRAW_API__;
  });
  // Wait for socket connection (critical for realtime sync assertions).
  await page.waitForFunction(() => {
    // @ts-expect-error - injected in dev build
    return (window as any).__EXCALIDASH_SOCKET_STATUS__?.connected === true;
  });
  return page;
};

const waitForFileInEditor = async (page: Page, fileId: string) => {
  // Excalidraw may clear `dataURL` from in-memory files for perf/memory,
  // so the stable signal is that the file entry exists.
  const timeoutMs = 30000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page.evaluate((id) => {
      const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
      const files = api?.getFiles?.() || {};
      const entry = files?.[id];
      return !!entry && typeof entry.mimeType === "string";
    }, fileId);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for file ${fileId} to exist in editor`);
};

const injectImageElementThenFile = async (page: Page) => {
  return await page.evaluate(async () => {
    const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
    if (!api) throw new Error("Missing __EXCALIDASH_EXCALIDRAW_API__");

    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const fileId = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const elementId = `img_${Math.random().toString(36).slice(2)}`;

    // Tiny PNG data URL
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

    // Simulate async file arrival (paste/import often behaves like this)
    await new Promise((r) => setTimeout(r, 600));
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
};

const waitForElementPresent = async (page: Page, elementId: string) => {
  await page.waitForFunction(
    (id) => {
      const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
      const els = api?.getSceneElementsIncludingDeleted?.() || [];
      const el = els.find((e: any) => e?.id === id);
      return !!el && el.isDeleted !== true;
    },
    elementId,
    { timeout: 15000 }
  );
};

const waitForElementDeletedEverywhere = async (page: Page, elementId: string) => {
  await page.waitForFunction(
    (id) => {
      const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
      const els = api?.getSceneElementsIncludingDeleted?.() || [];
      const el = els.find((e: any) => e?.id === id);
      return !!el && el.isDeleted === true;
    },
    elementId,
    { timeout: 15000 }
  );
};

test.describe("Issue #25 - image sync + deletion across tabs", () => {
  const createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdDrawingIds) {
      try {
        await deleteDrawing(request, id);
      } catch {
        // ignore cleanup errors
      }
    }
    createdDrawingIds.length = 0;
  });

  test("image added in tab1 appears in tab2 and tab3; deletion propagates to all tabs", async ({
    browser,
    request,
  }) => {
    test.setTimeout(120000);
    const drawing = await createDrawing(request, {
      name: `Issue25_ImageCollab_${Date.now()}`,
      elements: [],
      files: {},
    });
    createdDrawingIds.push(drawing.id);

    const context = await browser.newContext();
    const page1 = await openEditorTab(context, drawing.id);
    const page2 = await openEditorTab(context, drawing.id);

    // Create the image in tab1 (element first, file later) to model paste/import.
    const { fileId, elementId } = await injectImageElementThenFile(page1);

    // Tab2 should receive the element and the file in real-time.
    await waitForElementPresent(page2, elementId);
    await waitForFileInEditor(page2, fileId);

    // Persist the current state explicitly (ensures tab3 loads it even if the editor didn't auto-save).
    const snapshot = await page1.evaluate(() => {
      const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
      const elements = api.getSceneElementsIncludingDeleted();
      const files = api.getFiles?.() || {};
      const appState = api.getAppState?.() || {};
      return {
        elements,
        files,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff",
          gridSize: appState.gridSize ?? null,
        },
      };
    });
    await updateDrawing(request, drawing.id, snapshot);

    // Open tab3 and ensure it loads (persistence path)
    const page3 = await openEditorTab(context, drawing.id);
    await waitForFileInEditor(page3, fileId);

    // Force the "tab2 doesn't disappear" repro: keep the image selected in tab2.
    await page2.evaluate((id) => {
      const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
      const appState = api.getAppState();
      api.updateScene({
        appState: {
          ...appState,
          selectedElementIds: { ...(appState.selectedElementIds || {}), [id]: true },
        },
      });
    }, elementId);

    // Delete the image from tab1 (programmatic delete to ensure broadcast)
    await page1.evaluate((id) => {
      const api = (window as any).__EXCALIDASH_EXCALIDRAW_API__;
      const els = api.getSceneElementsIncludingDeleted();
      const target = els.find((e: any) => e?.id === id);
      if (!target) throw new Error("Target element not found");
      const updated = {
        ...target,
        isDeleted: true,
        version: (target.version ?? 0) + 1,
        versionNonce: Math.floor(Math.random() * 2 ** 31),
        updated: Date.now(),
      };
      api.updateScene({ elements: els.map((e: any) => (e.id === id ? updated : e)) });
    }, elementId);

    // All tabs should converge to deleted
    await waitForElementDeletedEverywhere(page2, elementId);
    await waitForElementDeletedEverywhere(page3, elementId);

    // Also verify persistence layer captured the file (tab3 load case)
    const persisted = await getDrawing(request, drawing.id);
    const persistedFile = persisted.files?.[fileId];
    expect(typeof persistedFile?.dataURL).toBe("string");
    expect((persistedFile?.dataURL || "").length).toBeGreaterThan(0);

    await context.close();
  });
});

