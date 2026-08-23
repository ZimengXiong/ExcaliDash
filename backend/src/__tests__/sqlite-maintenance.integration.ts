import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  reclaimSqliteFreeSpace,
  type SqliteSpaceMetrics,
} from "../db/sqliteMaintenance";

const Database = require("better-sqlite3") as any;
const MB = 1024 * 1024;

const tempDirs: string[] = [];

const createDatabase = (name: string, incremental = false) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `excalidash-${name}-`));
  tempDirs.push(dir);
  const databasePath = path.join(dir, "test.db");
  const db = new Database(databasePath);
  db.pragma("page_size = 4096");
  if (incremental) {
    db.pragma("auto_vacuum = INCREMENTAL");
    db.exec("VACUUM");
  }
  db.exec("CREATE TABLE payload (id INTEGER PRIMARY KEY, value BLOB NOT NULL)");
  return { db, databasePath };
};

const fillThenDelete = (db: any, megabytes: number) => {
  const insert = db.prepare("INSERT INTO payload (value) VALUES (zeroblob(?))");
  const fill = db.transaction(() => {
    for (let index = 0; index < megabytes; index += 1) insert.run(MB);
  });
  fill();
  db.exec("DELETE FROM payload");
};

const createClient = (db: any, beforeExecute?: () => Promise<void>) => ({
  $queryRawUnsafe: async <T>(query: string): Promise<T> =>
    db.pragma(query.replace(/^PRAGMA\s+/i, "")) as T,
  $executeRawUnsafe: async (query: string): Promise<number> => {
    if (beforeExecute) await beforeExecute();
    db.exec(query);
    return 0;
  },
});

const expectConsistentMetrics = (
  metrics: SqliteSpaceMetrics,
  expectedFileBytes: number,
) => {
  expect(metrics.fileBytes).toBe(metrics.pageCount * metrics.pageSize);
  expect(metrics.freeBytes).toBe(metrics.freePageCount * metrics.pageSize);
  expect(metrics.fileBytes).toBe(expectedFileBytes);
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("SQLite free-space maintenance", () => {
  it("reclaims a real legacy SQLite file and reports measured before/after metrics", async () => {
    const { db, databasePath } = createDatabase("vacuum-full");
    try {
      fillThenDelete(db, 72);
      const sizeBefore = fs.statSync(databasePath).size;

      const result = await reclaimSqliteFreeSpace(
        createClient(db),
        `file:${databasePath}`,
      );
      const sizeAfter = fs.statSync(databasePath).size;

      expect(result?.mode).toBe("full");
      expect(result?.before.freeBytes).toBeGreaterThan(64 * MB);
      expect(result?.after.freePageCount).toBeLessThan(result!.before.freePageCount);
      expect(result?.reclaimedBytes).toBe(sizeBefore - sizeAfter);
      expectConsistentMetrics(result!.before, sizeBefore);
      expectConsistentMetrics(result!.after, sizeAfter);
      expect(db.pragma("auto_vacuum", { simple: true })).toBe(2);
    } finally {
      db.close();
    }
  });

  it("coalesces overlapping maintenance calls into one real incremental vacuum", async () => {
    const { db, databasePath } = createDatabase("vacuum-single-flight", true);
    let releaseExecute!: () => void;
    const executeGate = new Promise<void>((resolve) => {
      releaseExecute = resolve;
    });
    let executeCalls = 0;
    const client = createClient(db, async () => {
      executeCalls += 1;
      await executeGate;
    });

    try {
      fillThenDelete(db, 12);
      const first = reclaimSqliteFreeSpace(client, `file:${databasePath}`);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const second = reclaimSqliteFreeSpace(client, `file:${databasePath}`);

      expect(second).toBe(first);
      releaseExecute();
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult).toBe(secondResult);
      expect(firstResult?.mode).toBe("incremental");
      expect(firstResult?.after.pageCount).toBeLessThanOrEqual(firstResult!.before.pageCount);
      expect(firstResult?.reclaimedBytes).toBe(
        firstResult!.before.fileBytes - firstResult!.after.fileBytes,
      );
      expect(executeCalls).toBe(1);
    } finally {
      releaseExecute();
      db.close();
    }
  });
});
