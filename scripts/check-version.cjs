const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const version = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!semver.test(version)) {
  throw new Error(
    `VERSION must contain one valid SemVer value; received ${JSON.stringify(version)}`,
  );
}

for (const relativePath of [
  "package.json",
  "backend/package.json",
  "frontend/package.json",
  "e2e/package.json",
]) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, relativePath), "utf8"),
  );
  if (Object.hasOwn(manifest, "version")) {
    throw new Error(`${relativePath} duplicates VERSION`);
  }
  if (manifest.private !== true) {
    throw new Error(`${relativePath} must remain private`);
  }
}

for (const relativePath of [
  "package-lock.json",
  "backend/package-lock.json",
  "frontend/package-lock.json",
  "e2e/package-lock.json",
]) {
  const lockfile = JSON.parse(
    fs.readFileSync(path.join(root, relativePath), "utf8"),
  );
  if (Object.hasOwn(lockfile, "version")) {
    throw new Error(`${relativePath} duplicates VERSION`);
  }
}

console.log(`Version ${version} is sourced from VERSION`);
