/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { runPrisma } = require("./provider-prisma.cjs");

const backendRoot = path.resolve(__dirname, "..");

const resolveDatabaseUrl = (rawUrl) => {
  const defaultDbPath = path.resolve(backendRoot, "prisma/dev.db");

  if (!rawUrl || String(rawUrl).trim().length === 0) {
    return `file:${defaultDbPath}`;
  }

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

const runCapture = (args) => {
  try {
    const stdout = runPrisma(args, {
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

const run = (args) => {
  runPrisma(args, {
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
const shouldForceSingleUserDev =
  isNonProd &&
  process.env.AUTH_MODE !== "hybrid" &&
  process.env.AUTH_MODE !== "oidc_enforced" &&
  /^(1|true|yes)$/i.test(process.env.EXCALIDASH_DEV_SINGLE_USER || "");

const forceSingleUserDevMode = async () => {
  const { PrismaClient } = require("../src/generated/client");
  const prisma = new PrismaClient();

  try {
    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {
        authEnabled: false,
        authOnboardingCompleted: true,
      },
      create: {
        id: "default",
        authEnabled: false,
        authOnboardingCompleted: true,
        registrationEnabled: false,
        authLoginRateLimitEnabled: true,
        authLoginRateLimitWindowMs: 15 * 60 * 1000,
        authLoginRateLimitMax: 20,
      },
    });

    console.log("[predev] Forced local development into single-user mode (no login required).");
  } finally {
    await prisma.$disconnect();
  }
};

const main = async () => {
  const deploy = runCapture(["migrate", "deploy"]);
  if (deploy.ok) {
    if (deploy.stdout) process.stdout.write(deploy.stdout);
  } else {
    if (deploy.stdout) process.stdout.write(deploy.stdout);
    if (deploy.stderr) process.stderr.write(deploy.stderr);

    const stderr = deploy.stderr || "";
    const isP3005 = stderr.includes("P3005");

    if (isNonProd && isFileDb && isP3005) {
      const backupPath = backupDbIfPresent();
      console.warn(
        `[predev] Prisma migrate baseline required (P3005). Resetting local SQLite database.\n` +
          `  DATABASE_URL=${databaseUrl}\n` +
          (backupPath ? `  Backup: ${backupPath}\n` : "") +
        `  If you need to preserve local data, restore the backup and baseline manually.`,
      );

      run(["migrate", "reset", "--force", "--skip-seed"]);
    } else {
      throw deploy.error;
    }
  }

  if (shouldForceSingleUserDev) {
    await forceSingleUserDevMode();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
