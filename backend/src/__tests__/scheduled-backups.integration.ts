import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
