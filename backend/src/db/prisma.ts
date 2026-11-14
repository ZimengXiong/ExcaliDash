import { PrismaClient } from "../generated/client";
import type { config as AppConfig } from "../config";
import { enableIncrementalAutoVacuum } from "./sqliteMaintenance";
import { readDatabaseUrl } from "../config/databaseUrl";

// Load config lazily. A static import would eagerly evaluate the config module
// the moment this module is imported, snapshotting the environment before tests
// (e.g. audit.test.ts) get a chance to set feature-flag env vars in beforeAll.
const getConfig = (): typeof AppConfig =>
  (require("../config") as { config: typeof AppConfig }).config;

declare global {
  var __excalidashPrisma: PrismaClient | undefined;
}

/**
 * Connection defaults for SQLite `file:` URLs. Non-SQLite URLs are returned
 * unchanged, and any parameter the operator already set is left alone.
 *
 * SQLite PRAGMAs such as busy_timeout are per-connection, so running
 * `PRAGMA busy_timeout` once through the pool only reaches one connection
 * (issue #303). Prisma's SQLite connector instead applies these URL
 * parameters to every connection it opens:
 *
 * - socket_timeout=10: seconds each connection waits on a lock before failing
 *   with SQLITE_BUSY (Prisma's default is 5; this matches the 10s intent of
 *   the PRAGMA below, see issue #182).
 * - connection_limit=1: SQLite allows a single writer anyway. One connection
 *   queues concurrent saves inside Prisma instead of letting two interactive
 *   transactions (read, then write) collide on different connections and
 *   stall until the transaction timeout.
 * - pool_timeout=30: with one connection, requests wait in the pool queue
 *   (default 10s) while a long transaction such as an import runs.
 */
export function withSqliteConnectionDefaults(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) return databaseUrl;
  const queryStart = databaseUrl.indexOf("?");
  const existing = queryStart === -1 ? "" : databaseUrl.slice(queryStart + 1);
  const present = new Set(
    existing
      .split("&")
      .map((pair) => pair.split("=", 1)[0])
      .filter(Boolean),
  );
  const additions = (
    [
      ["connection_limit", "1"],
      ["socket_timeout", "10"],
      ["pool_timeout", "30"],
    ] as const
  )
    .filter(([key]) => !present.has(key))
    .map(([key, value]) => `${key}=${value}`);
  if (additions.length === 0) return databaseUrl;
  const separator = queryStart === -1 ? "?" : existing === "" ? "" : "&";
  return `${databaseUrl}${separator}${additions.join("&")}`;
}

function createPrismaClient(): PrismaClient {
  // Pick up DATABASE_URL from a .env file too. Idempotent: it never overrides
  // variables that are already set, and config.ts calls it again later.
  require("dotenv").config();
  // Resolve relative SQLite paths now, the same way config.ts does, since
  // this client may be created before config.ts has rewritten DATABASE_URL.
  const databaseUrl = readDatabaseUrl();
  if (databaseUrl.startsWith("file:")) {
    return new PrismaClient({
      datasources: { db: { url: withSqliteConnectionDefaults(databaseUrl) } },
    });
  }
  return new PrismaClient();
}

const prismaClient = globalThis.__excalidashPrisma ?? createPrismaClient();

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
    // The URL parameters from withSqliteConnectionDefaults already set the
    // timeout on every connection; this PRAGMA only reaches the connection
    // that runs it, so it is kept for the WAL switch ordering below.
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
    await enableIncrementalAutoVacuum(prismaClient, databaseUrl);
  } catch (err) {
    // Surface real failures (e.g. permission, corrupted db) instead of swallowing.
    console.warn("[prisma] Failed to configure SQLite PRAGMAs:", err);
  }
}

export { prismaClient as prisma };
