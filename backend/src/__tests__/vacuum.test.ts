import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";
import os from "os";
import fs from "fs";

const queryRawUnsafe = vi.fn();
const executeRawUnsafe = vi.fn();

/** Real free space would make these tests depend on the host's disk. */
const { statfs } = vi.hoisted(() => ({
  statfs: vi.fn(async () => ({ bavail: 2 ** 40, bsize: 1 })),
}));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: { ...actual, promises: { ...actual.promises, statfs } },
    promises: { ...actual.promises, statfs },
  };
});

vi.mock("../generated/client", () => ({
  PrismaClient: class {
    $queryRawUnsafe = queryRawUnsafe;
    $executeRawUnsafe = executeRawUnsafe;
  },
}));

const PAGE_SIZE = 4096;
const MB = 1024 * 1024;

const pragmaReplies = (pageCount: number, freeCount: number, autoVacuum = 0) => {
  queryRawUnsafe.mockImplementation(async (sql: string) => {
    if (sql.includes("page_count")) return [{ page_count: pageCount }];
    if (sql.includes("freelist_count")) return [{ freelist_count: freeCount }];
    if (sql.includes("page_size")) return [{ page_size: PAGE_SIZE }];
    if (sql.includes("auto_vacuum")) return [{ auto_vacuum: autoVacuum }];
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

describe("incremental mode", () => {
  const originalUrl = process.env.DATABASE_URL;
  let dir: string;

  beforeEach(() => {
    vi.resetModules();
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vacuum-inc-"));
    process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns pages without rewriting the file", async () => {
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB), 2);
    const reclaim = await loadHelper();

    await reclaim();

    const calls = executeRawUnsafe.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.startsWith("PRAGMA incremental_vacuum"))).toBe(true);
    expect(calls).not.toContain("VACUUM");
  });

  it("ignores the cooldown, since nothing expensive happens", async () => {
    fs.writeFileSync(path.join(dir, ".last-vacuum"), String(Date.now()), "utf8");
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB), 2);
    const reclaim = await loadHelper();

    await reclaim();

    expect(executeRawUnsafe).toHaveBeenCalled();
  });

  it("leaves a few free megabytes alone", async () => {
    pragmaReplies(pagesFor(220 * MB), pagesFor(4 * MB), 2);
    const reclaim = await loadHelper();

    await expect(reclaim()).resolves.toBeNull();
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("converts a legacy database during its last full VACUUM", async () => {
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB), 0);
    const reclaim = await loadHelper();

    await reclaim();

    const pragmas = queryRawUnsafe.mock.calls.map((c) => String(c[0]));
    expect(pragmas).toContain("PRAGMA auto_vacuum = INCREMENTAL");
    expect(executeRawUnsafe).toHaveBeenCalledWith("VACUUM");
  });
});

describe("disk headroom", () => {
  const originalUrl = process.env.DATABASE_URL;
  let dir: string;

  beforeEach(() => {
    vi.resetModules();
    queryRawUnsafe.mockReset();
    executeRawUnsafe.mockReset();
    statfs.mockReset();
    statfs.mockResolvedValue({ bavail: 2 ** 40, bsize: 1 } as never);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vacuum-disk-"));
    process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a full rewrite that would not fit", async () => {
    // 220 MB file needs ~440 MB headroom; only 300 MB is available.
    statfs.mockResolvedValue({ bavail: 300 * MB, bsize: 1 } as never);
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB), 0);
    const reclaim = await loadHelper();

    await expect(reclaim()).resolves.toBeNull();
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("skips rather than guess when free space cannot be read", async () => {
    statfs.mockRejectedValue(new Error("ENOSYS"));
    pragmaReplies(pagesFor(220 * MB), pagesFor(210 * MB), 0);
    const reclaim = await loadHelper();

    await expect(reclaim()).resolves.toBeNull();
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });
});
