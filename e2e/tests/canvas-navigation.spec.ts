import { test, expect } from "@playwright/test";
import { createDrawing, deleteDrawing } from "./helpers/api";

test("native two-finger gestures pan while modified wheel zooms", async ({
  page,
  request,
}) => {
  const drawing = await createDrawing(request, {
    name: `Navigation ${Date.now()}`,
  });
  try {
    await page.goto(`/editor/${drawing.id}`);
    const canvas = page.locator("canvas.excalidraw__canvas.interactive");
    await expect(canvas).toBeVisible();
    const state = () =>
      page.evaluate(() => {
        const app = (
          window as any
        ).__EXCALIDASH_EXCALIDRAW_API__?.getAppState();
        return app
          ? { x: app.scrollX, y: app.scrollY, zoom: app.zoom.value }
          : null;
      });
    await expect.poll(state).not.toBeNull();
    await canvas.hover({ timeout: 10000 });
    const before = (await state())!;
    await page.mouse.wheel(48, 0);
    await expect.poll(async () => (await state())!.x).not.toBe(before.x);
    expect((await state())!.zoom).toBe(before.zoom);

    const horizontal = (await state())!;
    await page.mouse.wheel(0, 16.5);
    await expect.poll(async () => (await state())!.y).not.toBe(horizontal.y);
    expect((await state())!.zoom).toBe(before.zoom);

    const vertical = (await state())!;
    await page.mouse.wheel(12.5, 18);
    await expect.poll(async () => (await state())!.x).not.toBe(vertical.x);
    await expect.poll(async () => (await state())!.y).not.toBe(vertical.y);
    expect((await state())!.zoom).toBe(before.zoom);

    await page.keyboard.down("Control");
    try {
      await page.mouse.wheel(0, -48);
      await expect
        .poll(async () => (await state())!.zoom)
        .not.toBe(before.zoom);
    } finally {
      await page.keyboard.up("Control");
    }
  } finally {
    await deleteDrawing(request, drawing.id);
  }
});
