import { test, expect, type Page } from "@playwright/test";
import {
  cleanupDrawings,
  createDrawing,
  getDrawing,
} from "./helpers/api";

type SocketEvent = { name: string; payload: any };

const observeSocketEvents = (page: Page, events: SocketEvent[]) => {
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string" || !payload.startsWith("42")) return;
      try {
        const [name, eventPayload] = JSON.parse(payload.slice(2));
        if (typeof name === "string") events.push({ name, payload: eventPayload });
      } catch {
        // Socket.IO also sends Engine.IO control frames, which are not JSON events.
      }
    });
  });
};

const interactiveCanvas = (page: Page) =>
  page.locator("canvas.excalidraw__canvas.interactive");

const waitForEditor = async (page: Page) => {
  await expect(interactiveCanvas(page)).toBeVisible();
};

test.describe("Real-time Collaboration", () => {
  const createdDrawingIds: string[] = [];

  test.afterEach(async ({ request }) => {
    await cleanupDrawings(request, createdDrawingIds);
  });

  test("shows each connected collaborator in the editor header", async ({ browser, request }) => {
    const drawing = await createDrawing(request, { name: `Collab_Presence_${Date.now()}` });
    createdDrawingIds.push(drawing.id);
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    try {
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      await page1.goto(`/editor/${drawing.id}`);
      await page2.goto(`/editor/${drawing.id}`);
      await Promise.all([waitForEditor(page1), waitForEditor(page2)]);

      // The header always contains the local avatar; the second avatar is the peer.
      await expect(page1.getByTestId("collaborator-avatar")).toHaveCount(2);
      await expect(page2.getByTestId("collaborator-avatar")).toHaveCount(2);
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test("sends the same drawn element identity and content to a collaborator", async ({ browser, request }) => {
    const drawing = await createDrawing(request, {
      name: `Collab_Sync_${Date.now()}`,
      elements: [],
    });
    createdDrawingIds.push(drawing.id);
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    try {
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const remoteEvents: SocketEvent[] = [];
      observeSocketEvents(page2, remoteEvents);
      await page1.goto(`/editor/${drawing.id}`);
      await page2.goto(`/editor/${drawing.id}`);
      await Promise.all([waitForEditor(page1), waitForEditor(page2)]);
      await expect(page1.getByTestId("collaborator-avatar")).toHaveCount(2);

      const canvas = interactiveCanvas(page1);
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Interactive canvas not found");
      await page1.keyboard.press("r");
      await page1.mouse.move(box.x + 100, box.y + 100);
      await page1.mouse.down();
      await page1.mouse.move(box.x + 300, box.y + 200, { steps: 5 });
      await page1.mouse.up();

      let localElement: any;
      await expect.poll(async () => {
        const saved = await getDrawing(request, drawing.id);
        localElement = saved.elements?.find((element) => !element.isDeleted);
        return localElement?.id;
      }).toEqual(expect.any(String));

      await expect.poll(() => remoteEvents.find(
        (event) => event.name === "element-update" && event.payload?.elements?.some(
          (element: any) => element.id === localElement.id,
        ),
      )).toMatchObject({
        name: "element-update",
        payload: {
          drawingId: drawing.id,
          elements: expect.arrayContaining([expect.objectContaining({
            id: localElement.id,
            type: localElement.type,
            x: localElement.x,
            y: localElement.y,
            width: localElement.width,
            height: localElement.height,
          })]),
        },
      });
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test("broadcasts collaborator cursor movement", async ({ browser, request }) => {
    const drawing = await createDrawing(request, { name: `Collab_Cursor_${Date.now()}` });
    createdDrawingIds.push(drawing.id);
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    try {
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const remoteEvents: SocketEvent[] = [];
      observeSocketEvents(page2, remoteEvents);
      await page1.goto(`/editor/${drawing.id}`);
      await page2.goto(`/editor/${drawing.id}`);
      await Promise.all([waitForEditor(page1), waitForEditor(page2)]);
      await expect(page1.getByTestId("collaborator-avatar")).toHaveCount(2);

      const box = await interactiveCanvas(page1).boundingBox();
      if (!box) throw new Error("Interactive canvas not found");
      await page1.mouse.move(box.x + 180, box.y + 180);
      await page1.waitForTimeout(75);
      await page1.mouse.move(box.x + 360, box.y + 300);

      await expect.poll(() => remoteEvents.filter((event) => event.name === "cursor-move"))
        .toHaveLength(2);
      const cursorEvents = remoteEvents.filter((event) => event.name === "cursor-move");
      expect(cursorEvents[0].payload.drawingId).toBe(drawing.id);
      expect(cursorEvents[0].payload.pointer).not.toEqual(cursorEvents[1].payload.pointer);
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
