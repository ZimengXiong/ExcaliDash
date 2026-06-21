import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

// In 0.18.0 the old excalidraw-assets / excalidraw-assets-dev directories were
// replaced by dist/prod and dist/dev.  Only the fonts sub-directory needs to be
// copied to the public / dist output so that Excalidraw can load them at runtime
// via window.EXCALIDRAW_ASSET_PATH (which is set to "/" in index.html).
const EXCALIDRAW_DIST_DIR = path.join(
  frontendRoot,
  "node_modules",
  "@excalidraw",
  "excalidraw",
  "dist"
);

// src relative to EXCALIDRAW_DIST_DIR  →  dest name inside the target root
const ASSET_COPIES = [
  { src: path.join("prod", "fonts"), dest: "fonts" },
];

const copyDir = async (src, dest) => {
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });
};

const getTargets = () => {
  const args = new Set(process.argv.slice(2));
  const targets = [];
  if (args.has("--public")) targets.push("public");
  if (args.has("--dist")) targets.push("dist");
  return targets.length > 0 ? targets : ["dist"];
};

const main = async () => {
  const targets = getTargets();

  for (const targetName of targets) {
    const targetRoot = path.join(frontendRoot, targetName);
    await fs.mkdir(targetRoot, { recursive: true });

    for (const { src: srcRel, dest: destName } of ASSET_COPIES) {
      const src = path.join(EXCALIDRAW_DIST_DIR, srcRel);
      const dest = path.join(targetRoot, destName);

      try {
        await fs.access(src);
      } catch (err) {
        console.error(`[copy-excalidraw-assets] Missing source dir: ${src}`);
        throw err;
      }

      await copyDir(src, dest);

      console.log(`[copy-excalidraw-assets] Copied ${srcRel} -> ${targetName}/${destName}`);
    }
  }
};

await main();
