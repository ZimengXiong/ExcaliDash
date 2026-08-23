import fs from "fs";
import path from "path";

type SqliteClient = {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  $executeRawUnsafe(query: string): Promise<unknown>;
};

export type SqliteSpaceMetrics = {
  pageCount: number;
  freePageCount: number;
  pageSize: number;
  fileBytes: number;
  freeBytes: number;
};

export type SqliteReclaimResult = {
  mode: "incremental" | "full";
  before: SqliteSpaceMetrics;
  after: SqliteSpaceMetrics;
  reclaimedBytes: number;
  durationMs: number;
};

const AUTO_VACUUM_NONE = 0;
const AUTO_VACUUM_INCREMENTAL = 2;
const AUTO_VACUUM_CONVERT_BELOW_BYTES = 8 * 1024 * 1024;
const FULL_VACUUM_MIN_FREE_BYTES = 64 * 1024 * 1024;
const FULL_VACUUM_MIN_FREE_RATIO = 0.3;
const FULL_VACUUM_ALWAYS_ABOVE_BYTES = 1024 * 1024 * 1024;
const INCREMENTAL_MIN_FREE_BYTES = 8 * 1024 * 1024;
const INCREMENTAL_PAGE_BUDGET = 20_000;

let activeMaintenance: Promise<SqliteReclaimResult | null> | null = null;

const readPragmaNumber = async (client: SqliteClient, name: string): Promise<number> => {
  const rows = await client.$queryRawUnsafe<Array<Record<string, unknown>>>(`PRAGMA ${name}`);
  const value = rows[0] ? Object.values(rows[0])[0] : 0;
  return Number(value ?? 0);
};

const readMetrics = async (client: SqliteClient): Promise<SqliteSpaceMetrics> => {
  const [pageCount, freePageCount, pageSize] = await Promise.all([
    readPragmaNumber(client, "page_count"),
    readPragmaNumber(client, "freelist_count"),
    readPragmaNumber(client, "page_size"),
  ]);
  return {
    pageCount,
    freePageCount,
    pageSize,
    fileBytes: pageCount * pageSize,
    freeBytes: freePageCount * pageSize,
  };
};

const parseSqlitePath = (databaseUrl: string): string | null => {
  if (!databaseUrl.startsWith("file:")) return null;
  const rawPath = databaseUrl.slice("file:".length).split("?", 1)[0];
  if (!rawPath || rawPath === ":memory:") return null;
  try {
    return path.resolve(decodeURIComponent(rawPath));
  } catch {
    return path.resolve(rawPath);
  }
};

const hasRewriteHeadroom = async (databasePath: string, fileBytes: number): Promise<boolean> => {
  try {
    const stats = await fs.promises.statfs(path.dirname(databasePath));
    const availableBytes = Number(stats.bavail) * Number(stats.bsize);
    if (availableBytes >= fileBytes * 2) return true;
    console.warn(
      `[Cleanup] Skipping SQLite VACUUM: needs about ${Math.ceil((fileBytes * 2) / 1024 / 1024)} MB ` +
        `free, but ${Math.floor(availableBytes / 1024 / 1024)} MB is available`,
    );
    return false;
  } catch (error) {
    console.warn("[Cleanup] Skipping SQLite VACUUM because disk headroom could not be read", error);
    return false;
  }
};

/**
 * Convert a small SQLite database while the required one-time rewrite is cheap.
 * Larger legacy databases are converted by the first eligible maintenance pass.
 */
export async function enableIncrementalAutoVacuum(
  client: SqliteClient,
  databaseUrl: string,
): Promise<void> {
  if (!databaseUrl.startsWith("file:")) return;
  const mode = await readPragmaNumber(client, "auto_vacuum");
  if (mode !== AUTO_VACUUM_NONE) return;

  const metrics = await readMetrics(client);
  if (!metrics.pageSize || metrics.fileBytes > AUTO_VACUUM_CONVERT_BELOW_BYTES) return;

  await client.$queryRawUnsafe("PRAGMA auto_vacuum = INCREMENTAL");
  await client.$executeRawUnsafe("VACUUM");
  console.log("[prisma] SQLite switched to incremental auto-vacuum");
}

const reclaim = async (
  client: SqliteClient,
  databaseUrl: string,
): Promise<SqliteReclaimResult | null> => {
  if (!databaseUrl.startsWith("file:")) return null;

  const before = await readMetrics(client);
  if (!before.pageCount || !before.pageSize) return null;
  const autoVacuum = await readPragmaNumber(client, "auto_vacuum");
  let mode: SqliteReclaimResult["mode"];

  const startedAt = Date.now();
  if (autoVacuum === AUTO_VACUUM_INCREMENTAL) {
    if (before.freeBytes < INCREMENTAL_MIN_FREE_BYTES) return null;
    const pages = Math.min(before.freePageCount, INCREMENTAL_PAGE_BUDGET);
    await client.$executeRawUnsafe(`PRAGMA incremental_vacuum(${pages})`);
    mode = "incremental";
  } else {
    const freeRatio = before.freePageCount / before.pageCount;
    const worthRewrite =
      before.freeBytes >= FULL_VACUUM_ALWAYS_ABOVE_BYTES ||
      (before.freeBytes >= FULL_VACUUM_MIN_FREE_BYTES && freeRatio >= FULL_VACUUM_MIN_FREE_RATIO);
    if (!worthRewrite) return null;

    const databasePath = parseSqlitePath(databaseUrl);
    if (!databasePath || !(await hasRewriteHeadroom(databasePath, before.fileBytes))) return null;
    await client.$queryRawUnsafe("PRAGMA auto_vacuum = INCREMENTAL");
    await client.$executeRawUnsafe("VACUUM");
    mode = "full";
  }

  const after = await readMetrics(client);
  const reclaimedBytes = Math.max(0, before.fileBytes - after.fileBytes);
  const durationMs = Date.now() - startedAt;
  console.log(
    `[Cleanup] SQLite ${mode} vacuum returned ${(reclaimedBytes / 1024 / 1024).toFixed(1)} MB ` +
      `(pages ${before.pageCount} -> ${after.pageCount}, free ${before.freePageCount} -> ${after.freePageCount}) ` +
      `in ${durationMs} ms`,
  );
  return { mode, before, after, reclaimedBytes, durationMs };
};

/** Return deleted SQLite pages to the filesystem, with at most one run in flight. */
export function reclaimSqliteFreeSpace(
  client: SqliteClient,
  databaseUrl: string,
): Promise<SqliteReclaimResult | null> {
  if (activeMaintenance) return activeMaintenance;
  activeMaintenance = reclaim(client, databaseUrl)
    .catch((error) => {
      console.error("[Cleanup] SQLite vacuum failed:", error);
      return null;
    })
    .finally(() => {
      activeMaintenance = null;
    });
  return activeMaintenance;
}

/** Let graceful shutdown avoid disconnecting Prisma during active maintenance. */
export async function waitForSqliteMaintenance(): Promise<void> {
  if (activeMaintenance) await activeMaintenance;
}
