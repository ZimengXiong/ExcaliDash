import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "./testUtils";

type PrismaModule = typeof import("../db/prisma");

describe("SQLite connection settings (issue #303)", () => {
  let mod: PrismaModule;
  let originalUrl: string | undefined;

  beforeAll(async () => {
    setupTestDb();
    originalUrl = process.env.DATABASE_URL;
    // Load a fresh copy of the real module against the test database so the
    // client it builds is the one production code would use. configureSqlite()
    // is deliberately not called: the URL parameters alone must be enough.
    delete (globalThis as { __excalidashPrisma?: unknown }).__excalidashPrisma;
    vi.resetModules();
    mod = await import("../db/prisma");
  });

  afterAll(async () => {
    await mod?.prisma.$disconnect();
    delete (globalThis as { __excalidashPrisma?: unknown }).__excalidashPrisma;
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  });

  it("applies the busy timeout to every pooled connection, not just one", async () => {
    // Interactive transactions each pin a connection for their duration, so
    // running many at once forces the pool to hand out different connections.
    const timeouts = await Promise.all(
      Array.from({ length: 12 }, () =>
        mod.prisma.$transaction(
          async (tx) => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const rows = await tx.$queryRawUnsafe<{ timeout: number }[]>(
              "PRAGMA busy_timeout",
            );
            return Number(rows[0].timeout);
          },
          { timeout: 20_000 },
        ),
      ),
    );
    expect(timeouts).toEqual(Array.from({ length: 12 }, () => 10_000));
  });

  it("survives concurrent read-then-write transactions on one drawing", async () => {
    const { prisma } = mod;
    const user = await prisma.user.create({
      data: { email: "busy@example.test", name: "Busy", passwordHash: "x" },
    });
    const drawing = await prisma.drawing.create({
      data: {
        userId: user.id,
        name: "Contended",
        elements: "[]",
        appState: "{}",
      },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        prisma.$transaction(async (tx) => {
          const current = await tx.drawing.findUniqueOrThrow({
            where: { id: drawing.id },
          });
          await tx.drawingSnapshot.create({
            data: {
              drawingId: drawing.id,
              version: current.version,
              elements: current.elements,
              appState: current.appState,
            },
          });
          return tx.drawing.update({
            where: { id: drawing.id },
            data: { name: `save ${i}`, version: { increment: 1 } },
          });
        }),
      ),
    );
    expect(
      results.filter((r) => r.status === "rejected").map((r) => String(r)),
    ).toEqual([]);
    const final = await prisma.drawing.findUniqueOrThrow({
      where: { id: drawing.id },
    });
    expect(final.version).toBe(drawing.version + 12);
  });
});

describe("withSqliteConnectionDefaults", () => {
  let withDefaults: PrismaModule["withSqliteConnectionDefaults"];
  beforeAll(async () => {
    withDefaults = (await import("../db/prisma")).withSqliteConnectionDefaults;
  });

  it("adds a single-connection pool and a 10s lock wait to SQLite URLs", () => {
    expect(withDefaults("file:/app/prisma/dev.db")).toBe(
      "file:/app/prisma/dev.db?connection_limit=1&socket_timeout=10&pool_timeout=30",
    );
  });

  it("appends to existing parameters and never overrides explicit ones", () => {
    expect(withDefaults("file:./dev.db?mode=rwc")).toBe(
      "file:./dev.db?mode=rwc&connection_limit=1&socket_timeout=10&pool_timeout=30",
    );
    expect(
      withDefaults(
        "file:./dev.db?connection_limit=4&socket_timeout=2&pool_timeout=5",
      ),
    ).toBe("file:./dev.db?connection_limit=4&socket_timeout=2&pool_timeout=5");
  });

  it("leaves non-SQLite URLs untouched", () => {
    const pg = "postgresql://u:p@localhost:5432/db?schema=public";
    expect(withDefaults(pg)).toBe(pg);
    expect(withDefaults("")).toBe("");
  });
});

describe("parseDatabaseTarget", () => {
  it("does not show SQLite connection parameters as part of the path", async () => {
    const { parseDatabaseTarget } = await import("../server/storageDoctor");
    expect(
      parseDatabaseTarget("file:/app/prisma/dev.db?connection_limit=1"),
    ).toEqual({ provider: "sqlite", target: "/app/prisma/dev.db" });
  });
});
