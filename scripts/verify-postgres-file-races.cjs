#!/usr/bin/env node
/*
 * Non-browser regression verification against a disposable PostgreSQL database.
 * Requires built backend modules, a PostgreSQL Prisma client, DATABASE_URL
 * naming excalidash_race, and RACE_DISPOSABLE=1. --expect-vulnerable verifies
 * the original failures; the default verifies both fixes.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { once } = require("node:events");

assert.equal(
  process.env.RACE_DISPOSABLE,
  "1",
  "disposable test opt-in required",
);
const databaseUrl = new URL(process.env.DATABASE_URL);
assert.equal(
  databaseUrl.pathname,
  "/excalidash_race",
  "reserved test database required",
);
const dist =
  process.env.RACE_DIST_ROOT || path.resolve(__dirname, "../backend/dist");
const clientPath =
  process.env.RACE_PRISMA_CLIENT_PATH || path.join(dist, "generated/client");
const { PrismaClient } = require(clientPath);
const express = require("express");
const { z } = require("zod");
const { storeDrawingFileOnce } = require(path.join(dist, "drawingFileStore"));
const { internDrawingFiles } = require(path.join(dist, "fileProcessing"));
const { applySceneUpdateTx } = require(
  path.join(dist, "routes/dashboard/sceneUpdate"),
);
const { registerDrawingCreateUpdateRoutes } = require(
  path.join(dist, "routes/dashboard/drawingCreateUpdateRoutes"),
);
const { registerFileRoutes } = require(path.join(dist, "routes/files"));
const expectVulnerable = process.argv.includes("--expect-vulnerable");
const barrierTimeoutMs = Number(process.env.RACE_BARRIER_TIMEOUT_MS || 15000);
assert(Number.isFinite(barrierTimeoutMs) && barrierTimeoutMs > 0);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const withDeadline = (promise) => {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("race barrier timed out")),
        15000,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
};
const connectionUrl = new URL(databaseUrl);
connectionUrl.searchParams.set("connection_limit", "1");
const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl.href } },
});
const barrier = new PrismaClient({
  datasources: { db: { url: connectionUrl.href } },
});
const parseJsonField = (raw, fallback) => (raw ? JSON.parse(raw) : fallback);
let owner;

async function firstInsertRace() {
  const drawing = await prisma.drawing.create({
    data: {
      userId: owner.id,
      name: "insert race",
      elements: "[]",
      appState: "{}",
      files: "{}",
    },
  });
  // Both inserts wait inside PostgreSQL. For the old emulated upsert this
  // ensures both missing-row reads have finished before either insert wins.
  const queries = [];
  const observed = new PrismaClient({
    datasources: { db: { url: databaseUrl.href } },
    log: [{ level: "query", emit: "event" }],
  });
  observed.$on("query", (event) => queries.push(event.query));
  const base = {
    drawingId: drawing.id,
    fileId: "first-image",
    storage: "db",
    s3Key: null,
    sizeBytes: 3,
  };
  const candidates = [
    { ...base, mimeType: "image/png", data: Buffer.from([1, 2, 3]) },
    { ...base, mimeType: "image/jpeg", data: Buffer.from([9, 9, 9]) },
  ];
  let pending;
  let outcomes;
  try {
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION race_pause_file_insert() RETURNS trigger AS $$
      BEGIN PERFORM pg_advisory_xact_lock(904064, 1); RETURN NEW; END;
      $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER race_pause_file_insert BEFORE INSERT ON "DrawingFile"
      FOR EACH ROW EXECUTE FUNCTION race_pause_file_insert()`);
    await barrier.$executeRawUnsafe("SELECT pg_advisory_lock(904064, 1)");
    pending = Promise.allSettled(
      candidates.map((content) => storeDrawingFileOnce(observed, content)),
    );
    const deadline = Date.now() + barrierTimeoutMs;
    for (;;) {
      const [{ waiting }] =
        await prisma.$queryRawUnsafe(`SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event = 'advisory' AND query LIKE '%DrawingFile%'`);
      if (waiting === 2) break;
      if (Date.now() >= deadline) throw new Error("race barrier timed out");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    // Unlock before draining blocked inserts, even if their expected overlap
    // never occurs (for example, a one-connection pool). No polling coroutine
    // survives this scope, and a failed check leaves no trigger behind.
    try {
      await barrier.$executeRawUnsafe("SELECT pg_advisory_unlock(904064, 1)");
      if (pending) outcomes = await pending;
    } finally {
      await observed.$disconnect();
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS race_pause_file_insert ON "DrawingFile"',
      );
      await prisma.$executeRawUnsafe(
        "DROP FUNCTION IF EXISTS race_pause_file_insert()",
      );
    }
  }
  const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
  const nativeInserts = queries.filter(
    (query) =>
      /INSERT INTO.*DrawingFile/.test(query) && /ON CONFLICT/.test(query),
  ).length;
  if (expectVulnerable) {
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, "P2002");
    assert.equal(nativeInserts, 0);
  } else {
    assert.equal(rejected.length, 0);
    assert.equal(nativeInserts, 2);
    const { data, ...metadata } = await prisma.drawingFile.findUniqueOrThrow({
      where: {
        drawingId_fileId: { drawingId: drawing.id, fileId: base.fileId },
      },
      select: { data: true, mimeType: true, storage: true, s3Key: true },
    });
    const winningInput = candidates.find((candidate) =>
      candidate.data.equals(data),
    );
    assert.ok(winningInput);
    assert.equal(metadata.mimeType, winningInput.mimeType);
    for (const outcome of outcomes) {
      assert.deepEqual(outcome.value, metadata);
    }
  }
  console.log(
    JSON.stringify({
      test: "simultaneous-first-file-inserts",
      rejected: rejected.length,
      nativeInserts,
      expectedVulnerable: expectVulnerable,
    }),
  );
}

async function failedSaveRace() {
  const drawing = await prisma.drawing.create({
    data: {
      userId: owner.id,
      name: "save race",
      elements: "[]",
      appState: "{}",
      files: "{}",
    },
  });
  const interned = deferred();
  const releaseFailed = deferred();
  const goodChecked = deferred();
  const releaseGood = deferred();
  const app = express();
  app.use(express.json());
  const auth = (req, _res, next) => {
    req.user = { id: owner.id };
    next();
  };
  app.use(auth);
  const asyncHandler = (handler) => (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
  registerDrawingCreateUpdateRoutes(app, {
    prisma,
    requireAuth: auth,
    optionalAuth: auth,
    asyncHandler,
    parseJsonField,
    drawingUpdateSchema: z.object({
      elements: z.array(z.any()),
      files: z.record(z.string(), z.any()),
      version: z.number(),
    }),
    getRequestPrincipal: async () => ({ kind: "user", userId: owner.id }),
    respondWithAuthErrorIfPresent: () => false,
    invalidateDrawingsCache: () => {},
    config: { nodeEnv: "test" },
    internDrawingFiles: async (files, userId, drawingId) => {
      const processed = await internDrawingFiles(
        files,
        userId,
        drawingId,
        prisma,
      );
      await applySceneUpdateTx({
        prisma,
        drawingId,
        parseJsonField,
        versionGuard: 1,
        mutate: () => ({ data: {} }),
      });
      interned.resolve(processed);
      await releaseFailed.promise;
      return processed;
    },
  });
  registerFileRoutes(app, {
    prisma,
    requireAuth: auth,
    optionalAuth: auth,
    asyncHandler,
  });
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: error.message });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  let good;
  try {
    const failed = fetch(`${origin}/drawings/${drawing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        elements: [],
        files: {
          image: {
            id: "image",
            dataURL: "data:image/png;base64,AQID",
            mimeType: "image/png",
          },
        },
      }),
    });
    const processed = await withDeadline(interned.promise);
    // Only the scheduling barrier is intercepted. Every read/write, including
    // the file check and the failed request's compensation, hits real PG.
    const pausedPrisma = {
      $transaction: (fn) =>
        prisma.$transaction(
          (tx) =>
            fn(
              new Proxy(tx, {
                get(target, key) {
                  if (key !== "drawingSnapshot")
                    return Reflect.get(target, key);
                  return new Proxy(target.drawingSnapshot, {
                    get(delegate, field) {
                      if (field !== "create")
                        return Reflect.get(delegate, field);
                      return async (args) => {
                        goodChecked.resolve();
                        await releaseGood.promise;
                        return delegate.create(args);
                      };
                    },
                  });
                },
              }),
            ),
          { timeout: 20000 },
        ),
    };
    good = applySceneUpdateTx({
      prisma: pausedPrisma,
      drawingId: drawing.id,
      parseJsonField,
      versionGuard: 2,
      mutate: () => ({
        data: {
          elements: JSON.stringify([
            { id: "image-element", type: "image", fileId: "image" },
          ]),
        },
        incomingFiles: processed,
        requiredFileIds: ["image"],
      }),
    });
    await withDeadline(goodChecked.promise);
    releaseFailed.resolve();
    const response = await withDeadline(failed);
    assert.equal(response.status, 409);
    const rowsAfterFailure = await prisma.drawingFile.count({
      where: { drawingId: drawing.id, fileId: "image" },
    });
    assert.equal(rowsAfterFailure, expectVulnerable ? 0 : 1);
    releaseGood.resolve();
    const saved = await withDeadline(good);
    assert.equal(saved.drawing.version, 3);
    assert.ok(JSON.parse(saved.drawing.files).image);
    const image = await fetch(`${origin}/files/${drawing.id}/image`);
    assert.equal(image.status, expectVulnerable ? 404 : 200);
    if (!expectVulnerable)
      assert.ok(
        Buffer.from(await image.arrayBuffer()).equals(Buffer.from([1, 2, 3])),
      );
    console.log(
      JSON.stringify({
        test: "failed-save-vs-uncommitted-valid-save",
        savedVersion: 3,
        rowsAfterFailure,
        imageHttpStatus: image.status,
        expectedVulnerable: expectVulnerable,
      }),
    );
  } finally {
    releaseFailed.resolve();
    releaseGood.resolve();
    if (good) await good.catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

(async () => {
  owner = await prisma.user.create({
    data: {
      email: `pg-races-${Date.now()}@test.local`,
      passwordHash: "unused",
      name: "PG races",
    },
  });
  await firstInsertRace();
  await failedSaveRace();
})()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "PostgreSQL race verification failed",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (owner) {
      const drawings = await prisma.drawing.findMany({
        where: { userId: owner.id },
        select: { id: true },
      });
      await prisma.drawingFile.deleteMany({
        where: { drawingId: { in: drawings.map((drawing) => drawing.id) } },
      });
      await prisma.user.delete({ where: { id: owner.id } });
    }
    await Promise.all([prisma.$disconnect(), barrier.$disconnect()]);
  });
