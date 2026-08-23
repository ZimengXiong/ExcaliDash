#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const MAX_LINES = Number(process.env.MAX_SOURCE_LINES || 399);
const ROOT = path.resolve(__dirname, "..");
const SOURCE_ROOTS = ["backend/src", "backend/scripts", "frontend/src", "e2e/tests", "scripts", "docs", "make"];
const EXACT_FILES = ["AGENTS.md", "Makefile", "README.md", "RELEASE.md"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".cjs", ".mjs", ".md", ".mk"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", "generated"]);
const countLines = (filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  if (content.length === 0) return 0;
  return content.endsWith("\n") ? content.split("\n").length - 1 : content.split("\n").length;
};
const walk = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) files.push(path.join(dir, entry.name));
  }
  return files;
};
const collectFiles = () => {
  const files = new Set();
  for (const sourceRoot of SOURCE_ROOTS) {
    const absoluteRoot = path.join(ROOT, sourceRoot);
    if (!fs.existsSync(absoluteRoot)) continue;
    for (const file of walk(absoluteRoot)) files.add(file);
  }
  for (const exactFile of EXACT_FILES) {
    const absoluteFile = path.join(ROOT, exactFile);
    if (fs.existsSync(absoluteFile)) files.add(absoluteFile);
  }
  return [...files].sort();
};
const files = collectFiles();
const failures = [];
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const lineCount = countLines(file);
  if (lineCount > MAX_LINES) failures.push(`${rel}: ${lineCount} lines (max ${MAX_LINES})`);
}
if (failures.length > 0) {
  console.error(`Authored files must stay under 400 lines:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Line-count check passed (${files.length} files checked; max ${MAX_LINES}; no legacy exceptions).`);
