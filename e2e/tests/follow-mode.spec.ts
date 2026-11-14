import { test, expect, type Page } from "@playwright/test";
import { createDrawing, deleteDrawing } from "./helpers/api";

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

// The scene point at the middle of the viewport, plus zoom. Both contexts use
// the same viewport size, so a follower converges on the same centre; its zoom
// is floored to Excalidraw's 0.1 zoom step.
const viewport = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__EXCALIDASH_EXCALIDRAW_API__.getAppState();
    return {
      centerX: Math.round(-s.scrollX + s.width / 2 / s.zoom.value),
      centerY: Math.round(-s.scrollY + s.height / 2 / s.zoom.value),
      zoom: s.zoom.value,
    };
  });

async function pan(page: Page, deltaX: number, deltaY: number) {
  const box = await page
    .locator("canvas.excalidraw__canvas.interactive")
    .boundingBox();
  if (!box) throw new Error("Canvas not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(deltaX, deltaY);
}

const tracks = (
  follower: { centerX: number; centerY: number; zoom: number },
  leader: { centerX: number; centerY: number; zoom: number },
) =>
  Math.abs(follower.centerX - leader.centerX) <= 1 &&
  Math.abs(follower.centerY - leader.centerY) <= 1 &&
  leader.zoom - follower.zoom >= 0 &&
  leader.zoom - follower.zoom < 0.1;

test.describe("Follow mode", () => {
  let drawingId: string;

  test.beforeEach(async ({ request }) => {
    drawingId = (
      await createDrawing(request, {
        name: `Follow_${Date.now()}`,
        elements: [],
      })
    ).id;
  });

  test.afterEach(async ({ request }) => {
    if (drawingId) await deleteDrawing(request, drawingId);
  });

  test("a follower tracks the followed user's viewport until they pan away", async ({
    browser,
    baseURL,
  }) => {
    const first = await browser.newContext({ baseURL });
    const second = await browser.newContext({ baseURL });
    try {
      const follower = await first.newPage();
      const leader = await second.newPage();
      await openEditor(follower, drawingId);
      await openEditor(leader, drawingId);
      await expect(follower.getByTestId("collaborator-avatar")).toHaveCount(2);

      // A presenter who switched to another window is still followable, and
      // following them jumps to where they already are.
      await pan(leader, 600, 400);
      await leader.evaluate(() => window.dispatchEvent(new Event("blur")));
      const followButton = follower.getByRole("button", { name: /^Follow / });
      await expect(followButton.locator(".grayscale")).toHaveCount(1);
      await followButton.click();
      await expect(follower.locator(".follow-mode")).toBeVisible();
      await expect(
        follower.getByRole("button", { name: /^Stop following / }),
      ).toHaveAttribute("aria-pressed", "true");
      const initial = await viewport(leader);
      await expect
        .poll(async () => tracks(await viewport(follower), initial))
        .toBe(true);

      // The leader zooms and switches away again; the follower keeps up.
      await leader.keyboard.down("Control");
      await pan(leader, 0, -300);
      await leader.keyboard.up("Control");
      await leader.evaluate(() => window.dispatchEvent(new Event("blur")));
      const target = await viewport(leader);
      expect(target.zoom).not.toBe(1);
      await expect
        .poll(async () => tracks(await viewport(follower), target))
        .toBe(true);
      await expect(follower.locator(".follow-mode")).toBeVisible();

      // Panning yourself ends the follow; the leader's moves no longer apply.
      await pan(follower, 0, 200);
      await expect(follower.locator(".follow-mode")).toBeHidden();
      await expect(followButton).toHaveAttribute("aria-pressed", "false");
      const detached = await viewport(follower);
      const before = await viewport(leader);
      await pan(leader, 800, 0);
      await expect.poll(() => viewport(leader)).not.toEqual(before);
      await follower.waitForTimeout(500);
      expect(await viewport(follower)).toEqual(detached);
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("following a follower tracks the leader at the end of the chain", async ({
    browser,
    baseURL,
  }) => {
    // Fixed names, so each follow button is unambiguous.
    const names = ["Leader", "Middle", "Tail"];
    const contexts = await Promise.all(
      names.map(async (name) => {
        const context = await browser.newContext({ baseURL });
        await context.addInitScript((name) => {
          localStorage.setItem(
            "excalidash-user-id",
            JSON.stringify({ id: name, name, color: "#4f46e5" }),
          );
        }, name);
        return context;
      }),
    );
    try {
      const [leader, middle, tail] = await Promise.all(
        contexts.map((context) => context.newPage()),
      );
      for (const page of [leader, middle, tail]) {
        await openEditor(page, drawingId);
      }
      for (const page of [leader, middle, tail]) {
        await expect(page.getByTestId("collaborator-avatar")).toHaveCount(3);
      }

      // Middle follows Leader, and Tail follows Middle.
      await middle.getByRole("button", { name: "Follow Leader" }).click();
      await tail.getByRole("button", { name: "Follow Middle" }).click();
      await expect(tail.locator(".follow-mode")).toBeVisible();

      // Only Leader pans; Middle and Tail both end up on Leader's view.
      await pan(leader, 500, 300);
      const target = await viewport(leader);
      for (const page of [middle, tail]) {
        await expect
          .poll(async () => tracks(await viewport(page), target))
          .toBe(true);
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
