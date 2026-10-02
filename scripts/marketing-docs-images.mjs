import { chromium } from "../e2e/node_modules/playwright/index.mjs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { captureCollaboration } from "./marketing-collaboration.mjs";

// Generate marketing assets, not browser verification of the docs site.
// Uses the isolated sample instance started by marketing-start.mjs.
const root = resolve(import.meta.dirname, "..");
const base = "http://127.0.0.1:6777";
const output = resolve(root, "artifacts/marketing/gallery");
const images = resolve(root, "docs/public/images");
const manifest = JSON.parse(
  await readFile(resolve(root, "artifacts/marketing/manifest.json"), "utf8"),
);
await mkdir(output, { recursive: true });
await mkdir(images, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const versions = {};
  for (const theme of ["dark", "light"]) {
    const [name] = await captureCollaboration(browser, base, output, manifest, {
      theme,
      titles: ["Blue-green deployment"],
    });
    await copyFile(
      resolve(output, `${name}.png`),
      resolve(images, `collaboration-${theme}.png`),
    );
    versions[theme] = createHash("sha256")
      .update(await readFile(resolve(images, `collaboration-${theme}.png`)))
      .digest("hex");
  }
  // Change URLs only after both assets exist. Each capture gets a fresh CDN key.
  const versionFile = resolve(images, "marketing-versions.json");
  const temporary = `${versionFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(versions, null, 2)}\n`);
  await rename(temporary, versionFile);
} finally {
  await browser.close();
}
