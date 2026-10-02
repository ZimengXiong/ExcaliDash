import { test, expect } from "@playwright/test";
import { createDrawing, deleteDrawing } from "./helpers/api";

test("non-latin physical keys select real canvas tools without rewriting input text", async ({
  page,
  request,
}) => {
  const drawing = await createDrawing(request, {
    name: `Keyboard layout ${Date.now()}`,
  });
  try {
    await page.goto(`/editor/${drawing.id}`);
    const canvas = page.locator(".excalidraw canvas").first();
    await expect(canvas).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean((window as any).__EXCALIDASH_EXCALIDRAW_API__),
        ),
      )
      .toBe(true);
    await canvas.dispatchEvent("keydown", {
      key: "к",
      code: "KeyR",
      bubbles: true,
      cancelable: true,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__EXCALIDASH_EXCALIDRAW_API__.getAppState()
              .activeTool.type,
        ),
      )
      .toBe("rectangle");
    await canvas.dispatchEvent("keydown", {
      key: "е",
      code: "KeyT",
      bubbles: true,
      cancelable: true,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__EXCALIDASH_EXCALIDRAW_API__.getAppState()
              .activeTool.type,
        ),
      )
      .toBe("text");

    await page.goto("/");
    const search = page.getByPlaceholder("Search drawings...");
    await search.fill("Привет");
    await search.evaluate((input) => {
      input.addEventListener(
        "keydown",
        (event) =>
          input.setAttribute("data-last-key", (event as KeyboardEvent).key),
        { once: true },
      );
    });
    await search.dispatchEvent("keydown", {
      key: "к",
      code: "KeyR",
      bubbles: true,
      cancelable: true,
    });
    await expect(search).toHaveAttribute("data-last-key", "к");
    await expect(search).toHaveValue("Привет");
  } finally {
    await deleteDrawing(request, drawing.id);
  }
});
