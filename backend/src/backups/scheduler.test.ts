import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  cronMatches,
  createSqliteBackup,
  parseCronSchedule,
} from "./scheduler";

const Database = require("better-sqlite3") as any;

const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "excalidash-backup-"));
  tempDirs.push(dir);
  return dir;
};

// createSqliteBackup runs a WAL checkpoint through Prisma before copying; a
// stub is enough because the copy itself reads the file via better-sqlite3.
const stubPrisma = { $executeRawUnsafe: async () => 0 } as any;

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("parseCronSchedule", () => {
  it("expands a 5-field expression by defaulting seconds to 0", () => {
    const cron = parseCronSchedule("0 4 * * *");
    expect(cron.seconds.has(0)).toBe(true);
    expect(cron.seconds.has(1)).toBe(false);
    expect(cron.hours.has(4)).toBe(true);
  });

  it("accepts 6-field expressions with lists, ranges and steps", () => {
    const cron = parseCronSchedule("0 0,30 1-3 * * *");
    expect([...cron.minutes].sort((a, b) => a - b)).toEqual([0, 30]);
    expect([...cron.hours].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("treats Sunday as both 0 and 7", () => {
    const cron = parseCronSchedule("0 0 4 * * 7");
    // 2024-01-07 is a Sunday.
    expect(cronMatches(cron, new Date(2024, 0, 7, 4, 0, 0))).toBe(true);
  });

  it("rejects malformed expressions", () => {
    expect(() => parseCronSchedule("nope")).toThrow();
    expect(() => parseCronSchedule("0 0 4 * *")).not.toThrow();
    expect(() => parseCronSchedule("0 99 * * *")).toThrow();
  });
});

describe("cronMatches", () => {
  it("matches a daily 04:00 schedule only at the right minute", () => {
    const cron = parseCronSchedule("0 0 4 * * *");
    expect(cronMatches(cron, new Date(2024, 5, 10, 4, 0, 0))).toBe(true);
    expect(cronMatches(cron, new Date(2024, 5, 10, 4, 1, 0))).toBe(false);
    expect(cronMatches(cron, new Date(2024, 5, 10, 5, 0, 0))).toBe(false);
  });

  it("ORs day-of-month and day-of-week when both are restricted", () => {
    // 03:00 on the 1st OR on Mondays.
    const cron = parseCronSchedule("0 3 1 * 1");
    // 2024-07-01 is a Monday: matches both.
    expect(cronMatches(cron, new Date(2024, 6, 1, 3, 0, 0))).toBe(true);
    // 2024-07-08 is a Monday but not the 1st: still matches (OR).
    expect(cronMatches(cron, new Date(2024, 6, 8, 3, 0, 0))).toBe(true);
    // 2024-07-15 is the 15th and a Monday? No, it's a Monday -> matches.
    // Use a day that is neither the 1st nor a Monday: 2024-07-09 (Tuesday).
    expect(cronMatches(cron, new Date(2024, 6, 9, 3, 0, 0))).toBe(false);
  });

  it("ANDs the day fields when only one is restricted", () => {
    // Every day at 03:00 (both day fields are *).
    const cron = parseCronSchedule("0 3 * * *");
    expect(cronMatches(cron, new Date(2024, 6, 9, 3, 0, 0))).toBe(true);
  });
});

describe("createSqliteBackup", () => {
  const seedDb = (dir: string): string => {
    const dbPath = path.join(dir, "source.db");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("hello");
    db.close();
    return dbPath;
  };

  it("writes a restricted-permission copy of the database", async () => {
    const srcDir = makeTempDir();
    const backupDir = path.join(makeTempDir(), "backups");
    const dbPath = seedDb(srcDir);

    const target = await createSqliteBackup({
      prisma: stubPrisma,
      databaseUrl: `file:${dbPath}`,
      backupDir,
      retentionDays: 14,
    });

    expect(target).not.toBeNull();
    expect(fs.existsSync(target as string)).toBe(true);
    // Owner-only file permissions (0600).
    expect(fs.statSync(target as string).mode & 0o777).toBe(0o600);

    // The copy is a usable database with the seeded row.
    const restored = new Database(target as string, { readonly: true });
    const row = restored.prepare("SELECT v FROM t WHERE id = 1").get();
    restored.close();
    expect(row.v).toBe("hello");
  });

  it("prunes backups older than the retention window", async () => {
    const srcDir = makeTempDir();
    const backupDir = path.join(makeTempDir(), "backups");
    const dbPath = seedDb(srcDir);

    fs.mkdirSync(backupDir, { recursive: true });
    const stale = path.join(backupDir, "excalidash-sqlite-2000-01-01.db");
    fs.writeFileSync(stale, "old");
    const oldTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
    fs.utimesSync(stale, oldTime / 1000, oldTime / 1000);
    // A non-backup file must be left untouched.
    const unrelated = path.join(backupDir, "keep.txt");
    fs.writeFileSync(unrelated, "keep");
    fs.utimesSync(unrelated, oldTime / 1000, oldTime / 1000);

    await createSqliteBackup({
      prisma: stubPrisma,
      databaseUrl: `file:${dbPath}`,
      backupDir,
      retentionDays: 14,
    });

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(unrelated)).toBe(true);
  });

  it("skips (returns null) for non-file DATABASE_URL values", async () => {
    const backupDir = path.join(makeTempDir(), "backups");
    const target = await createSqliteBackup({
      prisma: stubPrisma,
      databaseUrl: "postgresql://user:pass@localhost:5432/excalidash",
      backupDir,
      retentionDays: 14,
    });
    expect(target).toBeNull();
    expect(fs.existsSync(backupDir)).toBe(false);
  });
});
