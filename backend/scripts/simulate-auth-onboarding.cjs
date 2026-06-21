#!/usr/bin/env node

require("dotenv").config();

const path = require("path");
const { PrismaClient } = require("../src/generated/client");
const { runPrisma } = require("./provider-prisma.cjs");

const BOOTSTRAP_USER_ID = "bootstrap-admin";
const DEFAULT_SYSTEM_CONFIG_ID = "default";
const backendRoot = path.resolve(__dirname, "..");

const resolveDatabaseUrl = (rawUrl) => {
  const backendRoot = path.resolve(__dirname, "..");
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

process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL);

const parseArgs = (argv) => {
  const parsed = {
    scenario: "",
    dryRun: false,
    allowProd: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--scenario") {
      parsed.scenario = String(argv[i + 1] || "").trim().toLowerCase();
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (token === "--allow-production") {
      parsed.allowProd = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
  }

  return parsed;
};

const usage = () => {
  console.log(`Usage:
  node scripts/simulate-auth-onboarding.cjs --scenario fresh
  node scripts/simulate-auth-onboarding.cjs --scenario migration

Options:
  --dry-run           Show what would change without modifying data
  --allow-production  Override production safety check (not recommended)
  --help, -h          Show this help
`);
};

const assertScenario = (scenario) => {
  if (scenario !== "fresh" && scenario !== "migration") {
    throw new Error("Invalid --scenario. Use 'fresh' or 'migration'.");
  }
};

const nowIso = () => new Date().toISOString();

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  assertScenario(args.scenario);

const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv === "production" && !args.allowProd) {
    throw new Error(
      "Refusing to run in production. Pass --allow-production only if you explicitly intend this."
    );
  }

  if (nodeEnv !== "production") {
    const runDeploy = () =>
      runPrisma(["migrate", "deploy"], {
        stdio: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
        },
      });

    try {
      runDeploy();
    } catch (error) {
      const stdout =
        error && error.stdout
          ? Buffer.isBuffer(error.stdout)
            ? error.stdout.toString("utf8")
            : String(error.stdout)
          : "";
      const stderr =
        error && error.stderr
          ? Buffer.isBuffer(error.stderr)
            ? error.stderr.toString("utf8")
            : String(error.stderr)
          : "";
      const combined = `${stdout}\n${stderr}`;

      const canAutoResolve =
        combined.includes("Error: P3009") &&
        combined.includes("20260210153000_add_auth_onboarding_completed") &&
        combined.includes("duplicate column name: authOnboardingCompleted");

      if (!canAutoResolve) {
        throw error;
      }

      runPrisma(["migrate", "resolve", "--applied", "20260210153000_add_auth_onboarding_completed"], {
        stdio: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
        },
      });
      runDeploy();
    }
  }

  const prisma = new PrismaClient();

  try {
    const before = {
      activeUsers: await prisma.user.count({ where: { isActive: true } }),
      users: await prisma.user.count(),
      drawings: await prisma.drawing.count(),
      collections: await prisma.collection.count(),
      auth: await prisma.systemConfig.findUnique({
        where: { id: DEFAULT_SYSTEM_CONFIG_ID },
        select: {
          authEnabled: true,
          authOnboardingCompleted: true,
          registrationEnabled: true,
        },
      }),
    };

    console.log(`[simulate-auth-onboarding] DATABASE_URL=${process.env.DATABASE_URL}`);
    console.log(`[simulate-auth-onboarding] NODE_ENV=${nodeEnv}`);
    console.log(`[simulate-auth-onboarding] scenario=${args.scenario}`);
    console.log("[simulate-auth-onboarding] before:", before);

    if (args.dryRun) {
      console.log("[simulate-auth-onboarding] dry-run only. No data changed.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.systemConfig.upsert({
        where: { id: DEFAULT_SYSTEM_CONFIG_ID },
        update: {
          authEnabled: false,
          authOnboardingCompleted: false,
          registrationEnabled: false,
        },
        create: {
          id: DEFAULT_SYSTEM_CONFIG_ID,
          authEnabled: false,
          authOnboardingCompleted: false,
          registrationEnabled: false,
          authLoginRateLimitEnabled: true,
          authLoginRateLimitWindowMs: 15 * 60 * 1000,
          authLoginRateLimitMax: 20,
        },
      });

      await tx.user.updateMany({
        data: {
          isActive: false,
          mustResetPassword: true,
        },
      });

      await tx.user.upsert({
        where: { id: BOOTSTRAP_USER_ID },
        update: {
          email: "bootstrap@excalidash.local",
          username: null,
          passwordHash: "",
          name: "Bootstrap Admin",
          role: "ADMIN",
          mustResetPassword: true,
          isActive: false,
        },
        create: {
          id: BOOTSTRAP_USER_ID,
          email: "bootstrap@excalidash.local",
          username: null,
          passwordHash: "",
          name: "Bootstrap Admin",
          role: "ADMIN",
          mustResetPassword: true,
          isActive: false,
        },
      });

      if (args.scenario === "fresh") {
        await tx.drawing.deleteMany({});
        await tx.collection.deleteMany({});
        await tx.library.deleteMany({});
        await tx.user.deleteMany({
          where: {
            id: {
              not: BOOTSTRAP_USER_ID,
            },
          },
        });
        return;
      }

      await tx.collection.updateMany({
        data: { userId: BOOTSTRAP_USER_ID },
      });
      await tx.drawing.updateMany({
        data: { userId: BOOTSTRAP_USER_ID },
      });

      const collectionCount = await tx.collection.count();
      let targetCollectionId = null;

      if (collectionCount === 0) {
        targetCollectionId = `sim-migration-col-${Date.now()}`;
        await tx.collection.create({
          data: {
            id: targetCollectionId,
            name: "Migrated Collection",
            userId: BOOTSTRAP_USER_ID,
          },
        });
      } else {
        const existing = await tx.collection.findFirst({
          where: { userId: BOOTSTRAP_USER_ID },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        });
        targetCollectionId = existing ? existing.id : null;
      }

      const drawingCount = await tx.drawing.count();
      if (drawingCount === 0) {
        await tx.drawing.create({
          data: {
            id: `sim-migration-draw-${Date.now()}`,
            name: "Migrated Drawing",
            elements: "[]",
            appState: "{}",
            files: "{}",
            preview: null,
            version: 1,
            userId: BOOTSTRAP_USER_ID,
            collectionId: targetCollectionId,
          },
        });
      }
    });

    const after = {
      activeUsers: await prisma.user.count({ where: { isActive: true } }),
      users: await prisma.user.count(),
      drawings: await prisma.drawing.count(),
      collections: await prisma.collection.count(),
      auth: await prisma.systemConfig.findUnique({
        where: { id: DEFAULT_SYSTEM_CONFIG_ID },
        select: {
          authEnabled: true,
          authOnboardingCompleted: true,
          registrationEnabled: true,
        },
      }),
    };

    console.log("[simulate-auth-onboarding] after:", after);
    console.log(`[simulate-auth-onboarding] completed at ${nowIso()}`);
    console.log(
      "[simulate-auth-onboarding] If your backend is already running, wait ~5 seconds (auth cache TTL) or restart before refreshing the UI."
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
};

run().catch((error) => {
  console.error("simulate-auth-onboarding failed:", error.message || error);
  process.exitCode = 1;
});
