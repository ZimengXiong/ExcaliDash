import { test, expect, type Page } from "@playwright/test";
import { createDrawing, deleteDrawing, getDrawing } from "./helpers/api";

async function openEditor(page: Page, id: string) {
  await page.goto(`/editor/${id}`);
  await expect(
    page.locator("canvas.excalidraw__canvas.interactive"),
  ).toBeVisible();
  await page.waitForFunction(
    () =>
      Boolean((window as any).__EXCALIDASH_EXCALIDRAW_API__) &&
      (window as any).__EXCALIDASH_SOCKET_STATUS__?.connected === true,
  );
}

// Observe the real editor state; interactions still go through mouse/keyboard,
// and changes must traverse the running backend and Socket.IO connection.
const scene = (page: Page) =>
  page.evaluate(() =>
    (window as any).__EXCALIDASH_EXCALIDRAW_API__
      .getSceneElements()
      .map((element: any) => ({
        id: element.id,
        type: element.type,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      })),
  );

async function drawRectangle(page: Page) {
  const box = await page
    .locator("canvas.excalidraw__canvas.interactive")
    .boundingBox();
  if (!box) throw new Error("Canvas not found");
  const rectangle = page.getByRole("radio", { name: "Rectangle", exact: true });
  await page.locator('label:has([data-testid="toolbar-rectangle"])').click();
  await expect(rectangle).toBeChecked();
  await page.mouse.move(box.x + 350, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 550, box.y + 350, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => scene(page))
    .toEqual([
      expect.objectContaining({ type: "rectangle", width: 200, height: 100 }),
    ]);
}

test.describe("Real-time collaboration", () => {
  let drawingId: string;

  test.beforeEach(async ({ request }) => {
    drawingId = (
      await createDrawing(request, {
        name: `Collab_${Date.now()}`,
        elements: [],
      })
    ).id;
  });

  test.afterEach(async ({ request }) => {
    if (drawingId) await deleteDrawing(request, drawingId);
  });

  test("presence appears in both clients and disappears after disconnect", async ({
    browser,
    baseURL,
  }) => {
    const first = await browser.newContext({ baseURL });
    const second = await browser.newContext({ baseURL });
    try {
      const page1 = await first.newPage();
      const page2 = await second.newPage();
      await openEditor(page1, drawingId);
      await openEditor(page2, drawingId);
      await expect(page1.getByTestId("collaborator-avatar")).toHaveCount(2);
      await expect(page2.getByTestId("collaborator-avatar")).toHaveCount(2);
      await page2.close();
      await expect(page1.getByTestId("collaborator-avatar")).toHaveCount(1);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("a drawn shape reaches the other editor without reloading and persists", async ({
    browser,
    request,
    baseURL,
  }) => {
    const first = await browser.newContext({ baseURL });
    const second = await browser.newContext({ baseURL });
    try {
      const page1 = await first.newPage();
      const page2 = await second.newPage();
      await openEditor(page1, drawingId);
      await openEditor(page2, drawingId);
      await expect(page1.getByTestId("collaborator-avatar")).toHaveCount(2);
      await drawRectangle(page1);
      const expected = await scene(page1);
      await expect.poll(() => scene(page2)).toEqual(expected);
      await expect
        .poll(async () =>
          (await getDrawing(request, drawingId)).elements?.map(
            (e: any) => e.id,
          ),
        )
        .toEqual(expected.map((e: any) => e.id));
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("a nonempty scene survives reload in the browser", async ({
    page,
    request,
  }) => {
    await openEditor(page, drawingId);
    await drawRectangle(page);
    const expected = await scene(page);
    await expect
      .poll(async () =>
        (await getDrawing(request, drawingId)).elements?.map((e: any) => e.id),
      )
      .toEqual(expected.map((e: any) => e.id));
    await page.reload();
    await page.waitForFunction(() =>
      Boolean((window as any).__EXCALIDASH_EXCALIDRAW_API__),
    );
    await expect.poll(() => scene(page)).toEqual(expected);
  });

  test("cursor movement reaches the other client's collaborator state", async ({
    browser,
    baseURL,
  }) => {
    const first = await browser.newContext({ baseURL });
    const second = await browser.newContext({ baseURL });
    try {
      const page1 = await first.newPage();
      const page2 = await second.newPage();
      await openEditor(page1, drawingId);
      await openEditor(page2, drawingId);
      await expect(page2.getByTestId("collaborator-avatar")).toHaveCount(2);
      const pointers = () =>
        page2.evaluate(() =>
          Array.from(
            (window as any).__EXCALIDASH_EXCALIDRAW_API__
              .getAppState()
              .collaborators.values(),
          )
            .map((entry: any) => entry.pointer)
            .filter(Boolean),
        );
      const box = await page1
        .locator("canvas.excalidraw__canvas.interactive")
        .boundingBox();
      if (!box) throw new Error("Canvas not found");
      await page1.mouse.move(box.x + 400, box.y + 300);
      await expect.poll(pointers).toHaveLength(1);
      const before = await pointers();
      await page1.mouse.move(box.x + 500, box.y + 400);
      await expect.poll(pointers).not.toEqual(before);
      await expect.poll(pointers).toEqual([
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
        }),
      ]);
    } finally {
      await first.close();
      await second.close();
    }
  });
});
