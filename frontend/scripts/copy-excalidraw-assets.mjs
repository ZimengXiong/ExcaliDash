import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

const EXCALIDRAW_DIST_DIR = path.join(
  frontendRoot,
  "node_modules",
  "@excalidraw",
  "excalidraw",
  "dist"
);

const assetDirs = ["excalidraw-assets", "excalidraw-assets-dev"];

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

    for (const dirName of assetDirs) {
      const src = path.join(EXCALIDRAW_DIST_DIR, dirName);
      const destRoot = path.join(targetRoot, dirName);

      try {
        await fs.access(src);
      } catch (err) {
        console.error(`[copy-excalidraw-assets] Missing source dir: ${src}`);
        throw err;
      }

      await copyDir(src, destRoot);

      console.log(`[copy-excalidraw-assets] Copied ${dirName} -> ${targetName}`);
    }
  }
};

await main();
