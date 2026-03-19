/* eslint-disable no-console */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");

const resolveDatabaseUrl = (rawUrl) => {
  if (!rawUrl || String(rawUrl).trim().length === 0) {
    return "postgresql://excalidash:excalidash@localhost:5432/excalidash";
  }

  // PostgreSQL URLs pass through unchanged
  if (String(rawUrl).startsWith("postgresql://") || String(rawUrl).startsWith("postgres://")) {
    return String(rawUrl);
  }

  // Legacy SQLite file: URL support
  if (!String(rawUrl).startsWith("file:")) {
    return String(rawUrl);
  }

  const filePath = String(rawUrl).replace(/^file:/, "");
  const prismaDir = path.resolve(backendRoot, "prisma");
  const normalizedRelative = filePath.replace(/^\.\/?/, "");
  const hasLeadingPrismaDir =
    normalizedRelative === "prisma" || normalizedRelative.startsWith("prisma/");

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(hasLeadingPrismaDir ? backendRoot : prismaDir, normalizedRelative);

  return `file:${absolutePath}`;
};

const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL);
process.env.DATABASE_URL = databaseUrl;

const nodeEnv = process.env.NODE_ENV || "development";

const runCapture = (cmd) => {
  try {
    const stdout = execSync(cmd, {
      cwd: backendRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    return { ok: true, stdout: stdout || "", stderr: "" };
  } catch (error) {
    const err = error;
    const stderr =
      err && err.stderr
        ? Buffer.isBuffer(err.stderr)
          ? err.stderr.toString("utf8")
          : String(err.stderr)
        : "";
    const stdout =
      err && err.stdout
        ? Buffer.isBuffer(err.stdout)
          ? err.stdout.toString("utf8")
          : String(err.stdout)
        : "";
    return { ok: false, stdout, stderr, error: err };
  }
};

const run = (cmd) => {
  execSync(cmd, {
    cwd: backendRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
};

const getDbFilePath = () => {
  if (!databaseUrl.startsWith("file:")) return null;
  return databaseUrl.replace(/^file:/, "");
};

const backupDbIfPresent = () => {
  const dbPath = getDbFilePath();
  if (!dbPath) return null;
  if (!fs.existsSync(dbPath)) return null;

  const dir = path.dirname(dbPath);
  const base = path.basename(dbPath, path.extname(dbPath));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(dir, `${base}.${stamp}.backup`);

  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
};

const isNonProd = nodeEnv !== "production";
const isFileDb = databaseUrl.startsWith("file:");

const deploy = runCapture("npx prisma migrate deploy");
if (deploy.ok) {
  if (deploy.stdout) process.stdout.write(deploy.stdout);
} else {
  if (deploy.stdout) process.stdout.write(deploy.stdout);
  if (deploy.stderr) process.stderr.write(deploy.stderr);

  const stderr = deploy.stderr || "";
  const isP3005 = stderr.includes("P3005");

  if (isNonProd && isP3005) {
    if (isFileDb) {
      const backupPath = backupDbIfPresent();
      console.warn(
        `[predev] Prisma migrate baseline required (P3005). Resetting local database.\n` +
          `  DATABASE_URL=${databaseUrl}\n` +
          (backupPath ? `  Backup: ${backupPath}\n` : "") +
          `  If you need to preserve local data, restore the backup and baseline manually.`,
      );
    } else {
      console.warn(
        `[predev] Prisma migrate baseline required (P3005). Resetting database.\n` +
          `  DATABASE_URL=${databaseUrl}\n`,
      );
    }

    run("npx prisma migrate reset --force --skip-seed");
  } else {
    throw deploy.error;
  }
}
