#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCAN_ROOT = path.join(ROOT, "backend/src");
const EXTENSIONS = new Set([".ts"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", "generated", "__tests__"]);
const NEEDLE = "process.env";
const isAllowed = (rel) => rel === "backend/src/config.ts" || rel.startsWith("backend/src/config/");
const isTestFile = (name) => name.endsWith(".test.ts");
const walk = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name)) && !isTestFile(entry.name)) files.push(path.join(dir, entry.name));
  }
  return files;
};
const files = fs.existsSync(SCAN_ROOT) ? walk(SCAN_ROOT).sort() : [];
const failures = [];
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (isAllowed(rel)) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (line.includes(NEEDLE)) failures.push(`${rel}:${index + 1}`);
  });
}
if (failures.length > 0) {
  console.error(`process.env may only be read in backend/src/config.ts and backend/src/config/:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Env-boundary check passed (${files.length} files scanned; process.env confined to config).`);
