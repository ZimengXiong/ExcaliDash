import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createSqliteBackup,
  startScheduledBackups,
} from "../backups/scheduler";
import { getTestPrisma, setupTestDb } from "./testUtils";

const Database = require("better-sqlite3") as any;
const backupDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "excalidash-backup-check-"),
);

describe("scheduled SQLite backups", () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let databaseUrl: string;
  let drawingId: string;
  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    databaseUrl = process.env.DATABASE_URL!;
    await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
    const user = await prisma.user.create({
      data: {
        email: "backup@example.test",
        name: "Backup user",
        passwordHash: "test-only-hash",
      },
    });
    const drawing = await prisma.drawing.create({
      data: {
        userId: user.id,
        name: "Backup drawing",
        elements: "[]",
        appState: "{}",
      },
    });
    drawingId = drawing.id;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it("checkpoints a real Prisma database and creates a private, independent SQLite backup", async () => {
    const target = await createSqliteBackup({
      prisma,
      databaseUrl,
      backupDir,
      retentionDays: 14,
    });
    expect(target).not.toBeNull();
    expect(fs.statSync(target!).mode & 0o777).toBe(0o600);
    await prisma.drawing.update({
      where: { id: drawingId },
      data: { name: "Changed after backup" },
    });
    const backup = new Database(target!, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      expect(backup.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(
        backup.prepare("SELECT name FROM Drawing WHERE id = ?").get(drawingId)
          .name,
      ).toBe("Backup drawing");
    } finally {
      backup.close();
    }
  });

  it("never opens a second SQLite handle on the live database (issue #305)", async () => {
    // Closing a second SQLite library's handle in this process drops the POSIX
    // locks Prisma holds on the same file and can delete the live WAL/SHM.
    // Wrap better-sqlite3 before loading a fresh copy of the scheduler and
    // fail if it constructs any handle at all while backing up.
    const resolved = require.resolve("better-sqlite3");
    const original = require.cache[resolved]!.exports;
    const opened: unknown[] = [];
    const spy: any = function (this: unknown, ...args: unknown[]) {
      opened.push(args[0]);
      return new (original as any)(...args);
    };
    Object.assign(spy, original);
    require.cache[resolved]!.exports = spy;
    try {
      vi.resetModules();
      const fresh = await import("../backups/scheduler");
      const target = await fresh.createSqliteBackup({
        prisma,
        databaseUrl,
        backupDir: path.join(backupDir, "no-second-handle"),
        retentionDays: 14,
      });
      expect(target).not.toBeNull();
      expect(opened).toEqual([]);
    } finally {
      require.cache[resolved]!.exports = original;
    }
  });

  it("leaves the live WAL and SHM files in place (issue #305)", async () => {
    const dbPath = databaseUrl.replace(/^file:/, "");
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    // Make sure the WAL/SHM files exist and have been touched by Prisma.
    await prisma.drawing.update({
      where: { id: drawingId },
      data: { name: "Before WAL check" },
    });
    expect(fs.existsSync(walPath)).toBe(true);
    expect(fs.existsSync(shmPath)).toBe(true);
    const walInode = fs.statSync(walPath).ino;
    const shmInode = fs.statSync(shmPath).ino;

    const walBackupDir = path.join(backupDir, "wal-check");
    await createSqliteBackup({
      prisma,
      databaseUrl,
      backupDir: walBackupDir,
      retentionDays: 14,
    });

    expect(fs.existsSync(walPath)).toBe(true);
    expect(fs.existsSync(shmPath)).toBe(true);
    expect(fs.statSync(walPath).ino).toBe(walInode);
    expect(fs.statSync(shmPath).ino).toBe(shmInode);

    // Prisma keeps working and its writes land in the live WAL.
    await prisma.drawing.update({
      where: { id: drawingId },
      data: { name: "After WAL check" },
    });
    const row = await prisma.drawing.findUnique({ where: { id: drawingId } });
    expect(row?.name).toBe("After WAL check");
    expect(fs.statSync(walPath).size).toBeGreaterThan(0);
  });

  it("backs up databases whose URL has query parameters or a quote in the path", async () => {
    const withQuery = await createSqliteBackup({
      prisma,
      databaseUrl: `${databaseUrl}?connection_limit=1`,
      backupDir: path.join(backupDir, "query-url"),
      retentionDays: 14,
    });
    expect(withQuery).not.toBeNull();
    expect(fs.existsSync(withQuery!)).toBe(true);

    const quoted = await createSqliteBackup({
      prisma,
      databaseUrl,
      backupDir: path.join(backupDir, "it's a quoted dir"),
      retentionDays: 14,
    });
    expect(quoted).not.toBeNull();
    const backup = new Database(quoted!, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      expect(backup.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally {
      backup.close();
    }
  });

  it("writes an actual scheduled backup without execute-returned-results errors", async () => {
    const scheduledDir = path.join(backupDir, "scheduled");
    const stop = startScheduledBackups({
      prisma,
      databaseUrl,
      backupDir: scheduledDir,
      retentionDays: 14,
      schedule: "* * * * * *",
    });
    expect(stop).not.toBeNull();
    try {
      await expect
        .poll(
          () =>
            fs.existsSync(scheduledDir)
              ? fs
                  .readdirSync(scheduledDir)
                  .filter(
                    (name) =>
                      name.endsWith(".db") &&
                      (fs.statSync(path.join(scheduledDir, name)).mode &
                        0o777) ===
                        0o600,
                  ).length
              : 0,
          { timeout: 5000 },
        )
        .toBeGreaterThan(0);
    } finally {
      stop?.();
    }
  });
});
