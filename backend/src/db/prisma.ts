import { PrismaClient } from "../generated/client";
import type { config as AppConfig } from "../config";

// Load config lazily. A static import would eagerly evaluate the config module
// the moment this module is imported, snapshotting the environment before tests
// (e.g. audit.test.ts) get a chance to set feature-flag env vars in beforeAll.
const getConfig = (): typeof AppConfig =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require("../config") as { config: typeof AppConfig }).config;

declare global {
  // eslint-disable-next-line no-var
  var __excalidashPrisma: PrismaClient | undefined;
}

const prismaClient = globalThis.__excalidashPrisma ?? new PrismaClient();

// Cache the client across module re-imports (vitest resetModules, dev reload).
// Done unconditionally so this module never needs config at load time.
globalThis.__excalidashPrisma = prismaClient;

/**
 * Enable WAL journal mode and set a busy timeout for SQLite.
 * WAL allows concurrent reads during writes; busy_timeout makes writers
 * wait instead of failing immediately when the database is locked.
 *
 * Awaitable so the server bootstrap can ensure subsequent queries run
 * with WAL + busy_timeout already applied.
 */
export async function configureSqlite(): Promise<void> {
  const databaseUrl = getConfig().databaseUrl ?? "";
  // PRAGMA statements only apply to SQLite; skip them for other providers.
  if (databaseUrl && !databaseUrl.startsWith("file:")) {
    return;
  }
  try {
    // Order matters: PRAGMA journal_mode = WAL has to acquire the write
    // lock briefly, and without busy_timeout it fails immediately on
    // contention — the exact bootstrap race this fix exists to mitigate.
    // Set busy_timeout first so the WAL switch can wait for any lock the
    // initial Prisma client setup may have left in flight.
    //
    // PRAGMA statements return rows (busy_timeout returns the timeout,
    // journal_mode returns "wal"), so we use $queryRaw — the tagged-
    // template form rejects accidental interpolation, and accepts the
    // returned row.
    //
    // busy_timeout: give writers up to 10s to wait for a lock instead of
    // failing immediately with SQLITE_BUSY. Issue #182 showed the previous
    // 5s was not always enough under concurrent load; 10s stays well under
    // the HTTP request timeout while absorbing brief write bursts.
    await prismaClient.$queryRaw`PRAGMA busy_timeout = 10000;`;
    // journal_mode = WAL is persistent (stored in the DB file header), so
    // this survives connection churn and only needs setting once.
    await prismaClient.$queryRaw`PRAGMA journal_mode = WAL;`;
    // synchronous = NORMAL is the recommended pairing with WAL: durable
    // across application crashes, and only loses the last commit(s) on an
    // OS/power crash, in exchange for far fewer fsyncs under write load.
    await prismaClient.$queryRaw`PRAGMA synchronous = NORMAL;`;
  } catch (err) {
    // Surface real failures (e.g. permission, corrupted db) instead of swallowing.
    console.warn("[prisma] Failed to configure SQLite PRAGMAs:", err);
  }
}

export { prismaClient as prisma };
