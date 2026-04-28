import { PrismaClient } from "../generated/client";

declare global {
  // eslint-disable-next-line no-var
  var __excalidashPrisma: PrismaClient | undefined;
}

const prismaClient = globalThis.__excalidashPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__excalidashPrisma = prismaClient;
}

/**
 * Enable WAL journal mode and set a busy timeout for SQLite.
 * WAL allows concurrent reads during writes; busy_timeout makes writers
 * wait instead of failing immediately when the database is locked.
 *
 * Awaitable so the server bootstrap can ensure subsequent queries run
 * with WAL + busy_timeout already applied.
 */
export async function configureSqlite(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  // PRAGMA statements only apply to SQLite; skip them for other providers.
  if (databaseUrl && !databaseUrl.startsWith("file:")) {
    return;
  }
  try {
    await prismaClient.$executeRawUnsafe("PRAGMA journal_mode = WAL;");
    await prismaClient.$executeRawUnsafe("PRAGMA busy_timeout = 5000;");
  } catch (err) {
    // Surface real failures (e.g. permission, corrupted db) instead of swallowing.
    console.warn("[prisma] Failed to configure SQLite PRAGMAs:", err);
  }
}

export { prismaClient as prisma };
