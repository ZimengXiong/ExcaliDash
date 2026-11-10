/* global window, document, getComputedStyle */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const base = "http://127.0.0.1:6770";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "6770",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let serverOutput = "";
server.stdout.on("data", (data) => {
  serverOutput += data;
});
server.stderr.on("data", (data) => {
  serverOutput += data;
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      const response = await fetch(base + "/tests/browser/editor.html");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for the local test server. */
    }
    await delay(250);
  }
  assert(ready, "Local browser test server did not start");
  browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/tests/browser/editor.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(
    () =>
      window.editorCheck?.api &&
      !window.editorCheck.api.getAppState().isLoading,
  );
  assert.equal(
    await page.evaluate(() => window.editorCheck.api.getSceneElements()[0].id),
    "legacy-box",
  );
  await page.mouse.click(1100, 450, { button: "right" });
  const menu = page.locator(".context-menu");
  await menu.waitFor();
  const typography = await menu
    .locator(".context-menu-item__label")
    .first()
    .evaluate((el) => ({
      size: parseFloat(getComputedStyle(el).fontSize),
      lineHeight: getComputedStyle(el).lineHeight,
    }));
  assert(
    Math.abs(typography.size - 13.3333) < 0.1,
    `Menu should match official typography, got ${JSON.stringify(typography)}`,
  );
  assert.equal(typography.lineHeight, "normal");
  const dashTypography = await page.evaluate(() => {
    const button = document.createElement("button");
    button.className = "ui-toolbar-button";
    document.body.append(button);
    const style = getComputedStyle(button);
    const result = { size: style.fontSize, lineHeight: style.lineHeight };
    button.remove();
    return result;
  });
  assert.deepEqual(
    dashTypography,
    { size: "16px", lineHeight: "24px" },
    "Dash controls outside the editor keep their typography",
  );
  const menuText = await menu.innerText();
  assert(
    menuText.includes("Alternar grade"),
    `Expected Portuguese menu (${await page.locator("html").getAttribute("lang")}): ${menuText}`,
  );
  const binding = menu.getByText("Atalho de flecha", { exact: true });
  await binding.waitFor();
  await menu
    .getByText("Encaixar em pontos intermediários", { exact: true })
    .waitFor();
  if (process.env.EDITOR_UI_SCREENSHOT) {
    await page.screenshot({ path: process.env.EDITOR_UI_SCREENSHOT });
  }
  const beforeBinding = await page.evaluate(
    () => window.editorCheck.api.getAppState().bindingPreference,
  );
  await binding.click();
  assert.notEqual(
    await page.evaluate(
      () => window.editorCheck.api.getAppState().bindingPreference,
    ),
    beforeBinding,
  );
  await page.mouse.click(1100, 450, { button: "right" });
  const beforeMidpoint = await page.evaluate(
    () => window.editorCheck.api.getAppState().isMidpointSnappingEnabled,
  );
  await menu
    .getByText("Encaixar em pontos intermediários", { exact: true })
    .click();
  assert.notEqual(
    await page.evaluate(
      () => window.editorCheck.api.getAppState().isMidpointSnappingEnabled,
    ),
    beforeMidpoint,
  );
  console.log(
    "PASS: official menu typography, Portuguese labels, working binding and midpoint actions",
  );

  await page.keyboard.press("Escape");
  await page.keyboard.press("r");
  await page.mouse.move(900, 250);
  await page.mouse.down();
  await page.mouse.move(1050, 350, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    () => window.editorCheck.api.getSceneElements().length === 2,
  );
  await page.keyboard.press("Control+z");
  await page.waitForFunction(
    () => window.editorCheck.api.getSceneElements().length === 1,
  );
  await page.keyboard.press("Control+Shift+z");
  await page.waitForFunction(
    () => window.editorCheck.api.getSceneElements().length === 2,
  );
  const svg = await page.evaluate(() => window.editorCheck.exportSvg());
  assert(
    svg.includes("<svg") && svg.includes("<path"),
    "Existing and new elements must export to SVG",
  );
  console.log(
    "PASS: legacy scene loads, drawing/editing, undo/redo and SVG export",
  );

  await page.evaluate(() =>
    window.editorCheck.api.updateScene({
      appState: { scrollX: -1200, scrollY: 450, zoom: { value: 1.5 } },
    }),
  );
  await page.waitForFunction(
    () =>
      JSON.parse(
        localStorage.getItem(
          'excalidash:viewport:["browser-user","browser-drawing"]',
        ) ?? "null",
      )?.zoom.value === 1.5,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      window.editorCheck?.api &&
      !window.editorCheck.api.getAppState().isLoading,
  );
  const restored = await page.evaluate(() => {
    const state = window.editorCheck.api.getAppState();
    return {
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      zoom: state.zoom.value,
      count: window.editorCheck.api.getSceneElements().length,
    };
  });
  assert.deepEqual(restored, {
    scrollX: -1200,
    scrollY: 450,
    zoom: 1.5,
    count: 2,
  });
  assert.deepEqual(errors, [], "Browser must have no uncaught runtime errors");
  console.log(
    "PASS: scene and viewport restore after reload without runtime errors",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
