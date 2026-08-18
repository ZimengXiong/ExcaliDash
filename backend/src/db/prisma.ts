import fs from "fs";
import path from "path";
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
    // Order matters: PRAGMA journal_mode = WAL has to acquire the write
    // lock briefly, and without busy_timeout it fails immediately on
    // contention — the exact bootstrap race this fix exists to mitigate.
    // Set busy_timeout first so the WAL switch can wait for any lock the
    // initial Prisma client setup may have left in flight.
    //
    // PRAGMA statements return rows (busy_timeout returns 5000,
    // journal_mode returns "wal"), so we use $queryRaw — the tagged-
    // template form rejects accidental interpolation, and accepts the
    // returned row.
    await prismaClient.$queryRaw`PRAGMA busy_timeout = 5000;`;
    await prismaClient.$queryRaw`PRAGMA journal_mode = WAL;`;
  } catch (err) {
    // Surface real failures (e.g. permission, corrupted db) instead of swallowing.
    console.warn("[prisma] Failed to configure SQLite PRAGMAs:", err);
  }
}

export { prismaClient as prisma };

/**
 * Return space freed by deleted rows to the filesystem.
 *
 * SQLite keeps the pages of deleted rows on a free list instead of shrinking
 * the file, so a database that prunes on a schedule only ever grows: after the
 * snapshot retention had cleared every row on one instance, 218 MB of file
 * held 10 MB of data.
 *
 * VACUUM rewrites the file, which means an exclusive lock and room for a
 * second copy while it runs. It is therefore rare by construction: a large
 * absolute amount has to be free, a large share of the file has to be free,
 * and the previous run has to be days ago.
 */
const VACUUM_MARKER_FILE = ".last-vacuum";
const VACUUM_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const VACUUM_MIN_FREE_BYTES = 64 * 1024 * 1024;
const VACUUM_MIN_FREE_RATIO = 0.3;
/** Above this, tolerating the free list wastes more than a rewrite costs. */
const VACUUM_ALWAYS_ABOVE_BYTES = 1024 * 1024 * 1024;

const getSqliteFilePath = (databaseUrl: string): string | null =>
  databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : null;

/** Survives restarts — an in-memory cooldown would be reset by every deploy. */
const readLastVacuum = async (markerPath: string): Promise<number> => {
  try {
    const raw = await fs.promises.readFile(markerPath, "utf8");
    const parsed = Number(raw.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

export async function reclaimSqliteFreeSpace(): Promise<{
  reclaimedBytes: number;
  durationMs: number;
} | null> {
  if (process.env.ENABLE_SNAPSHOT_VACUUM === "false") return null;

  const databaseUrl = process.env.DATABASE_URL ?? "";
  // VACUUM is SQLite-specific; PostgreSQL maintains itself through autovacuum.
  const dbPath = getSqliteFilePath(databaseUrl);
  if (databaseUrl && !dbPath) return null;

  try {
    const markerPath = dbPath
      ? path.join(path.dirname(dbPath), VACUUM_MARKER_FILE)
      : null;
    if (markerPath) {
      const last = await readLastVacuum(markerPath);
      if (last && Date.now() - last < VACUUM_COOLDOWN_MS) return null;
    }

    const readPragma = async (name: string): Promise<number> => {
      const rows = await prismaClient.$queryRawUnsafe<
        Array<Record<string, unknown>>
      >(`PRAGMA ${name}`);
      const value = rows?.[0] ? Object.values(rows[0])[0] : 0;
      return Number(value ?? 0);
    };

    const [pageCount, freeCount, pageSize] = await Promise.all([
      readPragma("page_count"),
      readPragma("freelist_count"),
      readPragma("page_size"),
    ]);
    if (!pageCount || !pageSize) return null;

    const freeBytes = freeCount * pageSize;
    const fileBytes = pageCount * pageSize;
    const freeRatio = freeCount / pageCount;
    const worthIt =
      freeBytes >= VACUUM_ALWAYS_ABOVE_BYTES ||
      (freeBytes >= VACUUM_MIN_FREE_BYTES && freeRatio >= VACUUM_MIN_FREE_RATIO);
    if (!worthIt) return null;

    // A rewrite needs room for a second copy. Running out mid-way would fill
    // the volume of an installation that is already short on space.
    if (dbPath) {
      try {
        const stats = await fs.promises.statfs(path.dirname(dbPath));
        const availableBytes = Number(stats.bavail) * Number(stats.bsize);
        if (availableBytes < fileBytes * 2) {
          console.warn(
            `[Cleanup] Skipping VACUUM: needs ~${(fileBytes * 2) / 1024 / 1024 | 0} MB free, ` +
              `only ${availableBytes / 1024 / 1024 | 0} MB available`,
          );
          return null;
        }
      } catch {
        // Cannot tell — better to skip than to risk filling the volume.
        return null;
      }
    }

    const startedAt = Date.now();
    // VACUUM cannot run inside a transaction, so it goes out on its own.
    await prismaClient.$executeRawUnsafe("VACUUM");
    const durationMs = Date.now() - startedAt;

    if (markerPath) {
      await fs.promises
        .writeFile(markerPath, String(Date.now()), "utf8")
        .catch(() => undefined);
    }

    console.log(
      `[Cleanup] VACUUM reclaimed ${(freeBytes / 1024 / 1024).toFixed(1)} MB ` +
        `(${(fileBytes / 1024 / 1024).toFixed(1)} MB file, ${(freeRatio * 100).toFixed(0)}% free) ` +
        `in ${durationMs} ms`,
    );
    return { reclaimedBytes: freeBytes, durationMs };
  } catch (error) {
    // Never let housekeeping take the server down.
    console.error("[Cleanup] VACUUM failed:", error);
    return null;
  }
}
