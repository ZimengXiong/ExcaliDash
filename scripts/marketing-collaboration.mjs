import { resolve } from "node:path";

// Independent real browser sessions; presence and cursors travel through the
// application's normal Socket.IO room. No screenshot overlays or mocked users.
export async function captureCollaboration(browser, base, gallery, manifest) {
  const people = [
    { id: "demo-alex", name: "Alex Morgan", color: "#a78bfa" },
    { id: "demo-maya", name: "Maya Chen", color: "#38bdf8" },
    { id: "demo-sam", name: "Sam Rivera", color: "#fb923c" },
    { id: "demo-jordan", name: "Jordan Lee", color: "#4ade80" },
  ];
  const contexts = [];
  const pages = [];
  const captures = [];
  try {
    for (const person of people) {
      const context = await browser.newContext({
        viewport: { width: 1600, height: 1050 },
        deviceScaleFactor: 2,
      });
      contexts.push(context);
      await context.addInitScript(
        ({ person, ids }) => {
          localStorage.setItem("excalidash-user-id", JSON.stringify(person));
          localStorage.setItem(
            "excalidash-preferences",
            JSON.stringify({ theme: "dark" }),
          );
          for (const id of ids)
            localStorage.setItem(
              `excalidash:editor:${id}:autoHideEnabled`,
              "false",
            );
        },
        { person, ids: manifest.map((drawing) => drawing.id) },
      );
      pages.push(await context.newPage());
    }
    for (const [name, title] of [
      ["10-live-deployment-review", "Blue-green deployment"],
      ["11-live-pipeline-workshop", "Real-time data pipelines"],
    ]) {
      const drawing = manifest.find((item) => item.title === title);
      await Promise.all(
        pages.map(async (page) => {
          await page.goto(`${base}/editor/${drawing.id}`);
          await page.waitForFunction(
            () => window.__EXCALIDASH_SOCKET_STATUS__?.connected,
          );
          await page.evaluate(() => document.fonts.ready);
          await page
            .locator(".excalidraw canvas")
            .last()
            .click({ position: { x: 650, y: 450 } });
          await page.keyboard.press("Escape");
          await page.keyboard.press("Shift+Digit1");
        }),
      );
      await pages[0].waitForTimeout(1500);
      // Move actual pointers on each collaborator's canvas; all views use the
      // same viewport and fit-to-scene transform so positions are reproducible.
      for (const [index, position] of [
        [1, [550, 380]],
        [2, [1040, 550]],
        [3, [800, 750]],
      ]) {
        await pages[index].mouse.move(...position, { steps: 6 });
      }
      await pages[0].mouse.move(30, 2);
      await pages[0].waitForFunction(() => {
        const peers =
          window.__EXCALIDASH_EXCALIDRAW_API__?.getAppState().collaborators;
        return (
          peers?.size === 3 && [...peers.values()].every((peer) => peer.pointer)
        );
      });
      // Give autosaves time to complete; fail visibly instead of publishing
      // a capture with an error toast or masking an actual persistence bug.
      await pages[0].waitForTimeout(2200);
      for (const page of pages) {
        if (
          await page.locator('[data-sonner-toast][data-type="error"]').count()
        ) {
          throw new Error(`Collaboration capture ${name} has an error toast`);
        }
      }
      await pages[0].screenshot({
        path: resolve(gallery, `${name}.png`),
        animations: "disabled",
      });
      captures.push(name);
      console.log(`Captured ${name} with four live sessions`);
    }
    return captures;
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
