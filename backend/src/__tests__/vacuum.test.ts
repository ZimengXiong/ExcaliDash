import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import os from "os";
import fs from "fs";

const queryRawUnsafe = vi.fn();
const executeRawUnsafe = vi.fn();

vi.mock("../generated/client", () => ({
  PrismaClient: class {
    $queryRawUnsafe = queryRawUnsafe;
    $executeRawUnsafe = executeRawUnsafe;
  },
}));

const PAGE_SIZE = 4096;
const MB = 1024 * 1024;

const pragmaReplies = (pageCount: number, freeCount: number) => {
  queryRawUnsafe.mockImplementation(async (sql: string) => {
    if (sql.includes("page_count")) return [{ page_count: pageCount }];
    if (sql.includes("freelist_count")) return [{ freelist_count: freeCount }];
    if (sql.includes("page_size")) return [{ page_size: PAGE_SIZE }];
    return [];
  });
};

/** Pages needed to describe a file of the given size. */
const pagesFor = (bytes: number) => Math.round(bytes / PAGE_SIZE);

const loadHelper = async () => (await import("../db/prisma")).reclaimSqliteFreeSpace;

describe("reclaimSqliteFreeSpace", () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalFlag = process.env.ENABLE_SNAPSHOT_VACUUM;
  let dir: string;

  beforeEach(() => {
    vi.resetModules();
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vacuum-test-"));
    process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
    delete process.env.ENABLE_SNAPSHOT_VACUUM;
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    if (originalFlag === undefined) delete process.env.ENABLE_SNAPSHOT_VACUUM;
    else process.env.ENABLE_SNAPSHOT_VACUUM = originalFlag;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("never touches a PostgreSQL database", async () => {
    process.env.DATABASE_URL = "postgresql://user:pw@localhost:5432/excalidash";
    const reclaim = await loadHelper();

    await expect(reclaim()).resolves.toBeNull();
    expect(queryRawUnsafe).not.toHaveBeenCalled();
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("leaves a healthy file alone", async () => {
    pragmaReplies(pagesFor(500 * MB), pagesFor(10 * MB));
    const reclaim = await loadHelper();

    await expect(reclaim()).resolves.toBeNull();
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("ignores a mostly empty file that is still small", async () => {
    // 95 % free of 40 MB: rewriting costs more than the 38 MB it returns.
    pragmaReplies(pagesFor(40 * MB), pagesFor(38 * MB));
    const reclaim = await loadHelper();

    await expect(reclaim()).resolves.toBeNull();
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("reclaims a large share of a large file", async () => {
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB));
    const reclaim = await loadHelper();

    const result = await reclaim();

    expect(executeRawUnsafe).toHaveBeenCalledWith("VACUUM");
    expect(result?.reclaimedBytes).toBe(pagesFor(210 * MB) * PAGE_SIZE);
  });

  it("reclaims a huge free list even at a small share", async () => {
    // 1.5 GB free of 100 GB is only 1.5 %, but far too much to tolerate.
    pragmaReplies(pagesFor(100 * 1024 * MB), pagesFor(1536 * MB));
    const reclaim = await loadHelper();

    await reclaim();

    expect(executeRawUnsafe).toHaveBeenCalledWith("VACUUM");
  });

  it("holds off until the cooldown has passed", async () => {
    fs.writeFileSync(path.join(dir, ".last-vacuum"), String(Date.now()), "utf8");
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB));
    const reclaim = await loadHelper();

    await expect(reclaim()).resolves.toBeNull();
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("runs again once the cooldown is over", async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    fs.writeFileSync(path.join(dir, ".last-vacuum"), String(eightDaysAgo), "utf8");
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB));
    const reclaim = await loadHelper();

    await reclaim();

    expect(executeRawUnsafe).toHaveBeenCalledWith("VACUUM");
  });

  it("records the run so a restart cannot bypass the cooldown", async () => {
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB));
    const reclaim = await loadHelper();

    await reclaim();

    const marker = fs.readFileSync(path.join(dir, ".last-vacuum"), "utf8");
    expect(Number(marker)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("can be switched off entirely", async () => {
    process.env.ENABLE_SNAPSHOT_VACUUM = "false";
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB));
    const reclaim = await loadHelper();

    await expect(reclaim()).resolves.toBeNull();
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("survives a failing VACUUM instead of taking the server down", async () => {
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB));
    executeRawUnsafe.mockRejectedValue(new Error("database is locked"));
    const reclaim = await loadHelper();

    await expect(reclaim()).resolves.toBeNull();
  });
});
