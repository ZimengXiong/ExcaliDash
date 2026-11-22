import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import type { Server } from "socket.io";
import { Prisma, PrismaClient } from "../generated/client";
import { getTestPrisma, setupTestDb, cleanupTestDb } from "./testUtils";
import { encodeSnapshotField } from "../snapshots/snapshotCodec";
import { registerStorageRoutes } from "../routes/storage";
import { collectRetainedDrawingFileIds } from "../routes/storage/retainedFiles";
import { registerDrawingCreateUpdateRoutes } from "../routes/dashboard/drawingCreateUpdateRoutes";
import type { DrawingRouteContext } from "../routes/dashboard/drawingRouteContext";
import { createDrawingRouteContext } from "../routes/dashboard/drawingRouteContext";
import type { DashboardRouteDeps } from "../routes/dashboard/types";
import { applySceneUpdateTx } from "../routes/dashboard/sceneUpdate";
import { internDrawingFiles } from "../fileProcessing";
import { registerFileRoutes } from "../routes/files";
import { storeDrawingFileOnce } from "../drawingFileStore";
import {
  deleteS3Object,
  copyS3Object,
  getS3Config,
  isS3Enabled,
  listS3Objects,
  uploadBuffer,
} from "../s3";

vi.mock("../s3", () => ({
  isS3Enabled: vi.fn(() => false),
  getS3Config: vi.fn(() => null),
  deleteS3Object: vi.fn(async () => {}),
  copyS3Object: vi.fn(async () => {}),
  listS3Objects: vi.fn(async () => []),
  uploadBuffer: vi.fn(async () => "unused"),
  getPublicUrl: vi.fn((key: string) => `https://files.example/${key}`),
  buildS3Key: vi.fn(
    (
      userId: string,
      drawingId: string,
      fileId: string,
      ext: string,
      generation?: string,
    ) =>
      `${userId}/${drawingId}/${generation ? `${generation}/` : ""}${fileId}.${ext}`,
  ),
  generatePresignedDownloadUrl: vi.fn(
    async (key: string) => `https://downloads.example/${key}`,
  ),
  drawingS3Prefix: vi.fn(
    (userId: string, drawingId: string) => `${userId}/${drawingId}/`,
  ),
}));

const parseJsonField = <T>(raw: string | null | undefined, fallback: T): T =>
  raw ? JSON.parse(raw) : fallback;
const asyncHandler =
  <T>(
    handler: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => Promise<T>,
  ): express.RequestHandler =>
  (req, res, next) => {
    void handler(req, res, next).catch(next);
  };

describe("File reference lifetime", () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let app: express.Express;
  let auth: express.RequestHandler;

  beforeAll(() => {
    setupTestDb();
    prisma = getTestPrisma();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(isS3Enabled).mockReturnValue(false);
    vi.mocked(getS3Config).mockReturnValue(null);
    vi.mocked(listS3Objects).mockResolvedValue([]);
    vi.mocked(uploadBuffer).mockResolvedValue(undefined);
    vi.mocked(deleteS3Object).mockResolvedValue(undefined);
    await cleanupTestDb(prisma);
    await prisma.drawingFile.deleteMany({});
    await prisma.user.deleteMany({});
    const owner = await prisma.user.create({
      data: {
        email: "retention@test.local",
        passwordHash: "unused",
        name: "Owner",
      },
    });
    ownerId = owner.id;
    auth = (req, _res, next) => {
      req.user = { id: ownerId } as express.Request["user"];
      next();
    };
    app = express();
    app.use(express.json());
    app.use(auth);
  });

  const createDrawing = () =>
    prisma.drawing.create({
      data: {
        userId: ownerId,
        name: "Retention",
        elements: "[]",
        appState: "{}",
        files: "{}",
      },
    });
  const mountStorage = () =>
    registerStorageRoutes(app, {
      prisma,
      requireAuth: auth,
      asyncHandler,
      parseJsonField,
      invalidateDrawingsCache: vi.fn(),
      io: { to: () => ({ emit: vi.fn() }) } as unknown as Server,
    });

  const mountDrawingUpdates = (
    internFiles: DrawingRouteContext["internDrawingFiles"],
  ) =>
    registerDrawingCreateUpdateRoutes(app, {
      prisma,
      requireAuth: auth,
      optionalAuth: auth,
      asyncHandler,
      parseJsonField,
      drawingUpdateSchema: z.object({
        elements: z.array(z.any()),
        files: z.record(z.string(), z.any()),
        version: z.number().optional(),
      }),
      getRequestPrincipal: async () => ({ kind: "user", userId: ownerId }),
      respondWithAuthErrorIfPresent: () => false,
      invalidateDrawingsCache: vi.fn(),
      config: { nodeEnv: "test" },
      internDrawingFiles: internFiles,
    } as unknown as DrawingRouteContext);

  const mountFiles = () =>
    registerFileRoutes(app, {
      prisma,
      requireAuth: auth,
      optionalAuth: auth,
      asyncHandler,
    });

  it("reuses stored inline images in one metadata read and revalidates without reading bytes", async () => {
    const drawing = await createDrawing();
    const bytes = Buffer.alloc(128 * 1024, 1);
    const dataURL = `data:image/png;base64,${bytes.toString("base64")}`;
    const rows = Array.from({ length: 16 }, (_, i) => ({
      drawingId: drawing.id,
      fileId: `image-${i}`,
      mimeType: "image/png",
      storage: "db",
      sizeBytes: bytes.length,
      data: bytes,
    }));
    await prisma.drawingFile.createMany({ data: rows });
    const observed = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL! } },
      log: [{ level: "query", emit: "event" }],
    });
    const reads: string[] = [];
    observed.$on("query", ({ query }) => {
      if (query.startsWith("SELECT") && query.includes("DrawingFile")) {
        reads.push(query.split(" FROM ")[0]);
      }
    });
    try {
      const processed = await internDrawingFiles(
        Object.fromEntries(rows.map(({ fileId }) => [fileId, { dataURL }])),
        ownerId,
        drawing.id,
        observed,
      );
      expect(Object.keys(processed)).toHaveLength(rows.length);
      expect(reads).toHaveLength(1);
      expect(reads[0]).not.toContain('"data"');
      registerFileRoutes(app, {
        prisma: observed,
        requireAuth: auth,
        optionalAuth: auth,
        asyncHandler,
      });
      const result = await request(app)
        .get(`/files/${drawing.id}/image-0`)
        .set("If-None-Match", '"image-0"');
      expect(result.status).toBe(304);
      expect(reads).toHaveLength(2);
      expect(reads[1]).not.toContain('"data"');
    } finally {
      await observed.$disconnect();
    }
  });

  it("lists a collaborator's first raw S3 upload in the drawing owner's storage namespace", async () => {
    vi.mocked(isS3Enabled).mockReturnValue(true);
    const peer = await prisma.user.create({
      data: {
        email: "peer-retention@test.local",
        passwordHash: "unused",
        name: "Peer",
      },
    });
    const drawing = await createDrawing();
    await prisma.drawingPermission.create({
      data: {
        drawingId: drawing.id,
        granteeUserId: peer.id,
        permission: "edit",
        createdByUserId: ownerId,
      },
    });
    auth = (req, _res, next) => {
      req.user = {
        id: req.headers["x-test-user-id"] || ownerId,
      } as express.Request["user"];
      next();
    };
    const objects = new Map<string, Buffer>();
    vi.mocked(uploadBuffer).mockImplementation(async (key, bytes) => {
      objects.set(key, bytes);
    });
    vi.mocked(listS3Objects).mockImplementation(async (prefix) =>
      [...objects]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, bytes]) => ({ key, size: bytes.length })),
    );
    mountFiles();
    mountStorage();
    const bytes = Buffer.from([1, 2, 3]);
    const uploaded = await request(app)
      .put(`/drawings/${drawing.id}/files/peer-first`)
      .set("x-test-user-id", peer.id)
      .set("Content-Type", "image/png")
      .send(bytes);
    expect(uploaded.status).toBe(200);
    const downloaded = await request(app).get(
      `/files/${drawing.id}/peer-first`,
    );
    expect(downloaded.status).toBe(302);
    const diff = await request(app).get(`/drawings/${drawing.id}/files/diff`);
    expect(diff.status).toBe(200);
    expect(diff.body.files).toEqual([
      expect.objectContaining({
        fileId: "peer-first",
        inS3: true,
        inS3Record: true,
      }),
    ]);
    const row = await prisma.drawingFile.findUnique({
      where: {
        drawingId_fileId: { drawingId: drawing.id, fileId: "peer-first" },
      },
    });
    expect(row?.s3Key).toMatch(new RegExp(`^${ownerId}/${drawing.id}/`));
    expect(objects.get(row!.s3Key!)).toEqual(bytes);
    const retried = await request(app)
      .put(`/drawings/${drawing.id}/files/peer-first`)
      .set("Content-Type", "image/png")
      .send(Buffer.from([9, 9, 9]));
    expect(retried.status).toBe(200);
    expect(objects.size).toBe(1);
    expect(objects.get(row!.s3Key!)).toEqual(bytes);
  });

  it.each(["intern", "raw"])(
    "keeps an uploaded S3 object while its %s row has not been created",
    async (mode) => {
      vi.mocked(isS3Enabled).mockReturnValue(true);
      const drawing = await createDrawing();
      const bytes = Buffer.from([1, 2, 3]);
      const objects = new Map<string, Buffer>();
      let uploadStored!: () => void;
      let resumeUpload!: () => void;
      const stored = new Promise<void>((resolve) => {
        uploadStored = resolve;
      });
      const resumed = new Promise<void>((resolve) => {
        resumeUpload = resolve;
      });
      vi.mocked(uploadBuffer).mockImplementation(async (key, body) => {
        objects.set(key, Buffer.from(body));
        uploadStored();
        // S3 has persisted the bytes; the uploader has not created its row.
        await resumed;
      });
      vi.mocked(listS3Objects).mockImplementation(async () =>
        [...objects].map(([key, body]) => ({ key, size: body.length })),
      );
      vi.mocked(deleteS3Object).mockImplementation(async (key) => {
        objects.delete(key);
      });
      mountStorage();
      mountFiles();
      const pending =
        mode === "intern"
          ? internDrawingFiles(
              {
                image: {
                  dataURL: "data:image/png;base64,AQID",
                  mimeType: "image/png",
                },
              },
              ownerId,
              drawing.id,
              prisma,
            )
          : request(app)
              .put(`/drawings/${drawing.id}/files/image`)
              .set("Content-Type", "image/png")
              .send(bytes)
              .then((res) => {
                expect(res.status).toBe(200);
                return {
                  image: { dataURL: res.body.url, mimeType: "image/png" },
                };
              });
      await stored;
      try {
        expect(
          await prisma.drawingFile.count({ where: { drawingId: drawing.id } }),
        ).toBe(0);
        const trim = await request(app)
          .post(`/drawings/${drawing.id}/trim`)
          .send({ confirmName: drawing.name });
        expect(trim.status).toBe(200);
      } finally {
        resumeUpload();
      }
      const files = await pending;
      const saved = await applySceneUpdateTx({
        prisma,
        drawingId: drawing.id,
        parseJsonField,
        versionGuard: "optimistic",
        mutate: () => ({
          data: {},
          incomingFiles: files,
          requiredFileIds: ["image"],
        }),
      });
      expect(JSON.parse(saved.drawing.files).image).toBeDefined();
      const row = await prisma.drawingFile.findUniqueOrThrow({
        where: { drawingId_fileId: { drawingId: drawing.id, fileId: "image" } },
      });
      expect(row.s3Key && objects.get(row.s3Key)?.equals(bytes)).toBe(true);
    },
  );

  it.each(["intern-private", "intern-public", "raw-private", "raw-public"])(
    "keeps recreated S3 bytes when an old deletion completes late (%s)",
    async (mode) => {
      vi.mocked(isS3Enabled).mockReturnValue(true);
      if (mode.endsWith("public")) {
        vi.mocked(getS3Config).mockReturnValue({
          publicUrl: "https://files.example",
        } as ReturnType<typeof getS3Config>);
      }
      const drawing = await createDrawing();
      const oldKey = `${ownerId}/${drawing.id}/image.png`;
      const bytes = Buffer.from([1, 2, 3]);
      const objects = new Map([[oldKey, Buffer.from([9, 9, 9])]]);
      await prisma.drawingFile.create({
        data: {
          drawingId: drawing.id,
          fileId: "image",
          storage: "s3",
          s3Key: oldKey,
          mimeType: "image/png",
          sizeBytes: 3,
        },
      });
      let deletionStarted!: () => void;
      let resumeDeletion!: () => void;
      const started = new Promise<void>((resolve) => {
        deletionStarted = resolve;
      });
      const resumed = new Promise<void>((resolve) => {
        resumeDeletion = resolve;
      });
      vi.mocked(uploadBuffer).mockImplementation(async (key, body) => {
        objects.set(key, Buffer.from(body));
      });
      vi.mocked(deleteS3Object).mockImplementation(async (key) => {
        deletionStarted();
        await resumed;
        objects.delete(key);
      });
      mountStorage();
      mountFiles();
      const cleanup = request(app)
        .post(`/drawings/${drawing.id}/trim`)
        .send({ confirmName: drawing.name })
        .then((res) => res);
      await started;
      let freshKey: string | null = null;
      try {
        let files: Record<string, any>;
        if (mode.startsWith("intern")) {
          files = await internDrawingFiles(
            {
              image: {
                dataURL: "data:image/png;base64,AQID",
                mimeType: "image/png",
              },
            },
            ownerId,
            drawing.id,
            prisma,
          );
        } else {
          const upload = await request(app)
            .put(`/drawings/${drawing.id}/files/image`)
            .set("Content-Type", "image/png")
            .send(bytes);
          expect(upload.status).toBe(200);
          files = {
            image: { dataURL: upload.body.url, mimeType: "image/png" },
          };
        }
        await applySceneUpdateTx({
          prisma,
          drawingId: drawing.id,
          parseJsonField,
          versionGuard: "optimistic",
          mutate: () => ({
            data: {},
            incomingFiles: files,
            requiredFileIds: ["image"],
          }),
        });
        freshKey = (
          await prisma.drawingFile.findUniqueOrThrow({
            where: {
              drawingId_fileId: { drawingId: drawing.id, fileId: "image" },
            },
          })
        ).s3Key;
      } finally {
        resumeDeletion();
        expect((await cleanup).status).toBe(200);
      }
      expect(freshKey).not.toBe(oldKey);
      expect(freshKey && objects.get(freshKey)?.equals(bytes)).toBe(true);
      expect(objects.has(oldKey)).toBe(false);
      const image = await request(app).get(`/files/${drawing.id}/image`);
      expect(image.status).toBe(302);
      expect(image.headers.location).toBe(
        `https://downloads.example/${freshKey}`,
      );
    },
  );

  it.each(["intern", "raw"])(
    "preserves the first completed interning write against a concurrent %s upload",
    async (mode) => {
      vi.mocked(isS3Enabled).mockReturnValue(true);
      vi.mocked(getS3Config).mockReturnValue({
        publicUrl: "https://files.example",
      } as ReturnType<typeof getS3Config>);
      const drawing = await createDrawing();
      let bothUploading!: () => void;
      let releaseWinner!: () => void;
      let releaseLoser!: () => void;
      const started = new Promise<void>((resolve) => {
        bothUploading = resolve;
      });
      const winnerReleased = new Promise<void>((resolve) => {
        releaseWinner = resolve;
      });
      const loserReleased = new Promise<void>((resolve) => {
        releaseLoser = resolve;
      });
      const objects = new Map<string, Buffer>();
      let uploading = 0;
      vi.mocked(uploadBuffer).mockImplementation(async (key, body) => {
        objects.set(key, Buffer.from(body));
        if (++uploading === 2) bothUploading();
        await (body[0] === 1 ? winnerReleased : loserReleased);
      });
      vi.mocked(deleteS3Object).mockImplementation(async (key) => {
        objects.delete(key);
      });
      const winner = internDrawingFiles(
        { image: { dataURL: "data:image/png;base64,AQID" } },
        ownerId,
        drawing.id,
        prisma,
      );
      mountFiles();
      const loser =
        mode === "intern"
          ? internDrawingFiles(
              { image: { dataURL: "data:image/png;base64,CQkJ" } },
              ownerId,
              drawing.id,
              prisma,
            )
          : request(app)
              .put(`/drawings/${drawing.id}/files/image`)
              .set("Content-Type", "image/jpeg")
              .send(Buffer.from([9, 9, 9]))
              .then((res) => {
                expect(res.status).toBe(200);
                return { image: { dataURL: res.body.url } };
              });
      await started;
      releaseWinner();
      const first = await winner;
      releaseLoser();
      const second = await loser;
      const row = await prisma.drawingFile.findUniqueOrThrow({
        where: { drawingId_fileId: { drawingId: drawing.id, fileId: "image" } },
      });
      expect(
        row.s3Key && objects.get(row.s3Key)?.equals(Buffer.from([1, 2, 3])),
      ).toBe(true);
      expect(first.image.dataURL).toBe(`https://files.example/${row.s3Key}`);
      expect(second.image.dataURL).toBe(
        mode === "intern"
          ? first.image.dataURL
          : `/api/files/${drawing.id}/image`,
      );
      expect(row.mimeType).toBe("image/png");
      expect(objects.size).toBe(1);
      const losingKey = vi
        .mocked(uploadBuffer)
        .mock.calls.find(([, body]) => body[0] === 9)?.[0];
      expect(deleteS3Object).toHaveBeenCalledExactlyOnceWith(losingKey);
      const image = await request(app).get(`/files/${drawing.id}/image`);
      expect(image.status).toBe(302);
      expect(image.headers.location).toBe(
        `https://downloads.example/${row.s3Key}`,
      );
    },
  );

  it.each(["intern", "raw"])(
    "keeps a successful %s upload when deleting its losing generation fails",
    async (mode) => {
      vi.mocked(isS3Enabled).mockReturnValue(true);
      const drawing = await createDrawing();
      const key = `${ownerId}/${drawing.id}/winner/image.png`;
      const bytes = Buffer.from([1, 2, 3]);
      const objects = new Map([[key, bytes]]);
      await prisma.drawingFile.create({
        data: {
          drawingId: drawing.id,
          fileId: "image",
          storage: "s3",
          s3Key: key,
          mimeType: "image/png",
          sizeBytes: bytes.length,
        },
      });
      const lookup =
        mode === "intern"
          ? vi.spyOn(prisma.drawingFile, "findMany").mockResolvedValueOnce([])
          : vi
              .spyOn(prisma.drawingFile, "findUnique")
              .mockResolvedValueOnce(null);
      vi.mocked(uploadBuffer).mockImplementation(async (freshKey, body) => {
        objects.set(freshKey, Buffer.from(body));
      });
      vi.mocked(deleteS3Object).mockRejectedValueOnce(
        new Error("simulated cleanup failure"),
      );
      mountFiles();
      try {
        if (mode === "intern") {
          const processed = await internDrawingFiles(
            { image: { dataURL: "data:image/png;base64,CQkJ" } },
            ownerId,
            drawing.id,
            prisma,
          );
          expect(processed.image.dataURL).toBe(
            `/api/files/${drawing.id}/image`,
          );
        } else {
          const res = await request(app)
            .put(`/drawings/${drawing.id}/files/image`)
            .set("Content-Type", "image/png")
            .send(Buffer.from([9, 9, 9]));
          expect(res.status).toBe(200);
        }
        const freshKey = vi.mocked(uploadBuffer).mock.calls[0][0];
        expect(freshKey).not.toBe(key);
        expect(deleteS3Object).toHaveBeenCalledExactlyOnceWith(freshKey);
        expect(objects.get(key)?.equals(bytes)).toBe(true);
        expect(
          (
            await prisma.drawingFile.findUniqueOrThrow({
              where: {
                drawingId_fileId: { drawingId: drawing.id, fileId: "image" },
              },
            })
          ).s3Key,
        ).toBe(key);
      } finally {
        lookup.mockRestore();
      }
    },
  );

  it.each(["intern", "raw"])(
    "keeps database winner bytes after a stale missing-row lookup in %s",
    async (mode) => {
      const drawing = await createDrawing();
      const bytes = Buffer.from([1, 2, 3, 4]);
      await prisma.drawingFile.create({
        data: {
          drawingId: drawing.id,
          fileId: "image",
          storage: "db",
          data: bytes,
          mimeType: "image/png",
          sizeBytes: bytes.length,
        },
      });
      // Another writer has filled the row after this request's initial read.
      const lookup =
        mode === "intern"
          ? vi.spyOn(prisma.drawingFile, "findMany").mockResolvedValueOnce([])
          : vi
              .spyOn(prisma.drawingFile, "findUnique")
              .mockResolvedValueOnce(null);
      mountFiles();
      try {
        if (mode === "intern") {
          await internDrawingFiles(
            { image: { dataURL: "data:image/png;base64,CQkJ" } },
            ownerId,
            drawing.id,
            prisma,
          );
        } else {
          const res = await request(app)
            .put(`/drawings/${drawing.id}/files/image`)
            .set("Content-Type", "image/jpeg")
            .send(Buffer.from([9, 9, 9]));
          expect(res.status).toBe(200);
        }
        const row = await prisma.drawingFile.findUniqueOrThrow({
          where: {
            drawingId_fileId: { drawingId: drawing.id, fileId: "image" },
          },
        });
        expect(row.data && Buffer.from(row.data).equals(bytes)).toBe(true);
        expect(row.mimeType).toBe("image/png");
      } finally {
        lookup.mockRestore();
      }
    },
  );

  it("repairs an empty legacy row once when two stores race", async () => {
    const drawing = await createDrawing();
    await prisma.drawingFile.create({
      data: {
        drawingId: drawing.id,
        fileId: "image",
        storage: "db",
        data: null,
        mimeType: "image/png",
        sizeBytes: 0,
      },
    });
    const base = {
      drawingId: drawing.id,
      fileId: "image",
      storage: "db",
      s3Key: null,
      mimeType: "image/png",
      sizeBytes: 3,
    };
    const rows = await Promise.all([
      storeDrawingFileOnce(prisma, { ...base, data: Buffer.from([1, 2, 3]) }),
      storeDrawingFileOnce(prisma, {
        ...base,
        mimeType: "image/jpeg",
        data: Buffer.from([9, 9, 9]),
      }),
    ]);
    const winner = await prisma.drawingFile.findUniqueOrThrow({
      where: {
        drawingId_fileId: { drawingId: drawing.id, fileId: base.fileId },
      },
    });
    expect(rows[0]).toEqual(rows[1]);
    expect(rows[0].mimeType).toBe(winner.mimeType);
    expect(winner.data).toEqual(
      Buffer.from(winner.mimeType === "image/png" ? [1, 2, 3] : [9, 9, 9]),
    );
  });

  it("uses a native upsert for simultaneous first stores without changing winner bytes", async () => {
    const drawing = await createDrawing();
    const observed = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL! } },
      log: [{ level: "query", emit: "event" }],
    });
    const queries: string[] = [];
    observed.$on("query", (event) => queries.push(event.query));
    const base = {
      drawingId: drawing.id,
      fileId: "new-image",
      storage: "db",
      s3Key: null,
      mimeType: "image/png",
      sizeBytes: 3,
    };
    try {
      const rows = await Promise.all([
        storeDrawingFileOnce(observed, {
          ...base,
          data: Buffer.from([1, 2, 3]),
        }),
        storeDrawingFileOnce(observed, {
          ...base,
          mimeType: "image/jpeg",
          data: Buffer.from([9, 9, 9]),
        }),
      ]);
      expect(rows[0]).toEqual(rows[1]);
      const winner = await observed.drawingFile.findUniqueOrThrow({
        where: {
          drawingId_fileId: { drawingId: drawing.id, fileId: base.fileId },
        },
      });
      expect(rows[0].mimeType).toBe(winner.mimeType);
      expect(winner.data).toEqual(
        Buffer.from(winner.mimeType === "image/png" ? [1, 2, 3] : [9, 9, 9]),
      );
      expect(
        queries.filter((query) => /INSERT INTO.*DrawingFile/.test(query)),
      ).toHaveLength(2);
      expect(
        queries.filter((query) => /ON CONFLICT.*DO UPDATE/.test(query)),
      ).toHaveLength(2);
    } finally {
      await observed.$disconnect();
    }
  });

  it.each(["db", "s3"])(
    "keeps a failed update's tracked %s image until guarded trim reclaims it",
    async (storage) => {
      vi.mocked(isS3Enabled).mockReturnValue(storage === "s3");
      const drawing = await createDrawing();
      mountStorage();
      mountDrawingUpdates(async (files, userId, drawingId) => {
        const processed = await internDrawingFiles(
          files,
          userId,
          drawingId,
          prisma,
        );
        // An unrelated save advances the scene after this request passed its
        // preflight. Its image could still be used by another in-flight save.
        await prisma.drawing.update({
          where: { id: drawingId },
          data: { version: { increment: 1 } },
        });
        return processed;
      });
      const failed = await request(app)
        .put(`/drawings/${drawing.id}`)
        .send({
          version: 1,
          elements: [],
          files: {
            image: {
              dataURL: "data:image/png;base64,AQID",
              mimeType: "image/png",
            },
          },
        });
      expect(failed.status).toBe(409);
      const tracked = await prisma.drawingFile.findUniqueOrThrow({
        where: { drawingId_fileId: { drawingId: drawing.id, fileId: "image" } },
      });
      expect(tracked.storage).toBe(storage);
      expect(deleteS3Object).not.toHaveBeenCalled();
      const trimmed = await request(app)
        .post(`/drawings/${drawing.id}/trim`)
        .send({ confirmName: drawing.name });
      expect(trimmed.status).toBe(200);
      expect(
        await prisma.drawingFile.count({ where: { drawingId: drawing.id } }),
      ).toBe(0);
      if (storage === "s3") {
        expect(deleteS3Object).toHaveBeenCalledExactlyOnceWith(tracked.s3Key);
      }
    },
  );

  it("copies a generated S3 object into an independent drawing key", async () => {
    vi.mocked(isS3Enabled).mockReturnValue(true);
    const drawing = await createDrawing();
    const key = `${ownerId}/${drawing.id}/generation/image.png`;
    await prisma.drawingFile.create({
      data: {
        drawingId: drawing.id,
        fileId: "image",
        storage: "s3",
        s3Key: key,
        mimeType: "image/png",
        sizeBytes: 3,
      },
    });
    const context = createDrawingRouteContext({ prisma } as DashboardRouteDeps);
    const copied = await context.cloneS3FileReferences(
      drawing.id,
      "copy",
      ownerId,
      {
        image: {
          dataURL: `/api/files/${drawing.id}/image`,
          mimeType: "image/png",
        },
      },
    );
    const copyKey = `${ownerId}/copy/image.png`;
    expect(copyS3Object).toHaveBeenCalledExactlyOnceWith(
      key,
      copyKey,
      "image/png",
    );
    expect(copied.image.dataURL).toBe("/api/files/copy/image");
    expect(
      (
        await prisma.drawingFile.findUniqueOrThrow({
          where: { drawingId_fileId: { drawingId: "copy", fileId: "image" } },
        })
      ).s3Key,
    ).toBe(copyKey);
  });

  it.each(["trim", "orphans"])(
    "rejects an unversioned save when %s removes its interned image before commit",
    async (operation) => {
      const drawing = await createDrawing();
      mountStorage();
      mountDrawingUpdates(async (files, userId, drawingId) => {
        const processed = await internDrawingFiles(
          files,
          userId,
          drawingId,
          prisma,
        );
        const cleaned =
          operation === "trim"
            ? await request(app)
                .post(`/drawings/${drawingId}/trim`)
                .send({ confirmName: drawing.name })
            : await request(app)
                .delete(`/drawings/${drawingId}/files/orphans`)
                .send({ confirmName: drawing.name, fileIds: ["image"] });
        expect(cleaned.status).toBe(200);
        return processed;
      });
      const res = await request(app)
        .put(`/drawings/${drawing.id}`)
        .send({
          elements: [],
          files: {
            image: {
              dataURL: "data:image/png;base64,AQID",
              mimeType: "image/png",
            },
          },
        });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("VERSION_CONFLICT");
      const current = await prisma.drawing.findUniqueOrThrow({
        where: { id: drawing.id },
      });
      expect(current.files).toBe("{}");
      expect(current.version).toBe(2);
      expect(
        await prisma.drawingSnapshot.count({
          where: { drawingId: drawing.id },
        }),
      ).toBe(0);
    },
  );

  it("preserves ordinary external image references without requiring stored rows", async () => {
    const drawing = await createDrawing();
    mountDrawingUpdates((files, userId, drawingId) =>
      internDrawingFiles(files, userId, drawingId, prisma),
    );
    const external = {
      dataURL: "https://external.example/image.png",
      mimeType: "image/png",
    };
    const res = await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({ elements: [], files: { external } });
    expect(res.status).toBe(200);
    expect(res.body.files.external).toEqual(external);
    expect(
      await prisma.drawingFile.count({ where: { drawingId: drawing.id } }),
    ).toBe(0);
  });

  it("rejects a save when cleanup removes an image interned to a public S3 URL", async () => {
    vi.mocked(isS3Enabled).mockReturnValue(true);
    vi.mocked(getS3Config).mockReturnValue({
      publicUrl: "https://files.example",
    } as ReturnType<typeof getS3Config>);
    const drawing = await createDrawing();
    mountStorage();
    mountDrawingUpdates(async (files, userId, drawingId) => {
      const processed = await internDrawingFiles(
        files,
        userId,
        drawingId,
        prisma,
      );
      expect(processed.image.dataURL).toMatch(/^https:\/\/files.example\//);
      const trimmed = await request(app)
        .post(`/drawings/${drawingId}/trim`)
        .send({ confirmName: drawing.name });
      expect(trimmed.status).toBe(200);
      return processed;
    });
    const res = await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({
        elements: [],
        files: {
          image: {
            dataURL: "data:image/png;base64,AQID",
            mimeType: "image/png",
          },
        },
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("VERSION_CONFLICT");
    expect(
      (await prisma.drawing.findUniqueOrThrow({ where: { id: drawing.id } }))
        .files,
    ).toBe("{}");
  });

  it("rejects an existing public S3 reference reclaimed before a versionless save", async () => {
    vi.mocked(isS3Enabled).mockReturnValue(true);
    vi.mocked(getS3Config).mockReturnValue({
      publicUrl: "https://files.example",
    } as ReturnType<typeof getS3Config>);
    const drawing = await createDrawing();
    const image = {
      dataURL: "https://files.example/owner/drawing/image.png",
      mimeType: "image/png",
    };
    await prisma.drawingFile.create({
      data: {
        drawingId: drawing.id,
        fileId: "image",
        mimeType: "image/png",
        storage: "s3",
        s3Key: "owner/drawing/image.png",
      },
    });
    mountStorage();
    mountDrawingUpdates(async (files, userId, drawingId) => {
      const processed = await internDrawingFiles(
        files,
        userId,
        drawingId,
        prisma,
      );
      const trimmed = await request(app)
        .post(`/drawings/${drawingId}/trim`)
        .send({ confirmName: drawing.name });
      expect(trimmed.status).toBe(200);
      expect(await prisma.drawingFile.count({ where: { drawingId } })).toBe(0);
      return processed;
    });
    const saved = await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({ elements: [], files: { image } });
    expect(saved.status).toBe(409);
    expect(saved.body.code).toBe("VERSION_CONFLICT");
    const current = await prisma.drawing.findUniqueOrThrow({
      where: { id: drawing.id },
    });
    expect(current.files).toBe("{}");
    expect(current.version).toBe(2);
    expect(
      await prisma.drawingSnapshot.count({ where: { drawingId: drawing.id } }),
    ).toBe(0);
  });

  it("keeps bytes that enter history before a conflicting save runs compensation", async () => {
    const drawing = await createDrawing();
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
      getRequestPrincipal: async () => ({ kind: "user", userId: ownerId }),
      respondWithAuthErrorIfPresent: () => false,
      invalidateDrawingsCache: vi.fn(),
      config: { nodeEnv: "test" },
      internDrawingFiles: async (
        files: Record<string, any>,
        userId: string,
        drawingId: string,
      ) => {
        const processed = await internDrawingFiles(
          files,
          userId,
          drawingId,
          prisma,
        );
        // Two successful saves happen after interning but before this request's
        // version guard. The second moves its image from live files to history.
        await applySceneUpdateTx({
          prisma,
          drawingId,
          parseJsonField,
          versionGuard: 1,
          mutate: () => ({ data: {}, incomingFiles: processed }),
        });
        await applySceneUpdateTx({
          prisma,
          drawingId,
          parseJsonField,
          versionGuard: 2,
          mutate: () => ({ data: { files: "{}" } }),
        });
        return processed;
      },
    } as unknown as DrawingRouteContext);
    const res = await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({
        version: 1,
        elements: [],
        files: {
          image: {
            id: "image",
            mimeType: "image/png",
            dataURL: "data:image/png;base64,AQID",
          },
        },
      });
    expect(res.status).toBe(409);
    const current = await prisma.drawing.findUniqueOrThrow({
      where: { id: drawing.id },
    });
    expect(current.files).toBe("{}");
    expect(current.version).toBe(3);
    const row = await prisma.drawingFile.findUnique({
      where: { drawingId_fileId: { drawingId: drawing.id, fileId: "image" } },
    });
    expect(
      row?.data && Buffer.from(row.data).equals(Buffer.from([1, 2, 3])),
    ).toBe(true);
  });

  it.each(["trim", "orphans"])(
    "protects S3 history references during %s and deletes unrelated objects",
    async (operation) => {
      vi.mocked(isS3Enabled).mockReturnValue(true);
      const drawing = await createDrawing();
      const protectedKey = `${ownerId}/${drawing.id}/historical.png`;
      const orphanKey = `${ownerId}/${drawing.id}/orphan.png`;
      await prisma.drawingFile.createMany({
        data: [
          {
            drawingId: drawing.id,
            fileId: "historical",
            storage: "s3",
            s3Key: protectedKey,
            mimeType: "image/png",
            sizeBytes: 3,
          },
          {
            drawingId: drawing.id,
            fileId: "orphan",
            storage: "s3",
            s3Key: orphanKey,
            mimeType: "image/png",
            sizeBytes: 3,
          },
        ],
      });
      await prisma.drawingSnapshot.create({
        data: {
          drawingId: drawing.id,
          version: 1,
          appState: "{}",
          elements: "[]",
          files: encodeSnapshotField(
            JSON.stringify({
              historical: {
                dataURL: `/api/files/${drawing.id}/historical`,
                description: "x".repeat(1000),
              },
            }),
          ),
        },
      });
      vi.mocked(listS3Objects).mockResolvedValue([
        { key: protectedKey, size: 3 },
        { key: orphanKey, size: 3 },
      ]);
      mountStorage();
      const res =
        operation === "trim"
          ? await request(app)
              .post(`/drawings/${drawing.id}/trim`)
              .send({ confirmName: drawing.name })
          : await request(app)
              .delete(`/drawings/${drawing.id}/files/orphans`)
              .send({
                confirmName: drawing.name,
                fileIds: ["historical", "orphan"],
              });
      expect(res.status).toBe(200);
      expect(deleteS3Object).toHaveBeenCalledExactlyOnceWith(orphanKey);
      const rows = await prisma.drawingFile.findMany({
        where: { drawingId: drawing.id },
      });
      expect(rows.map((row) => row.fileId)).toEqual(["historical"]);
    },
  );

  it("does not reupload immutable existing S3 bytes from a stale inline entry", async () => {
    vi.mocked(isS3Enabled).mockReturnValue(true);
    const drawing = await createDrawing();
    const key = `${ownerId}/${drawing.id}/image.png`;
    await prisma.drawingFile.create({
      data: {
        drawingId: drawing.id,
        fileId: "image",
        storage: "s3",
        s3Key: key,
        mimeType: "image/png",
        sizeBytes: 3,
      },
    });
    const processed = await internDrawingFiles(
      { image: { dataURL: "data:image/png;base64,AAAA" } },
      ownerId,
      drawing.id,
      prisma,
    );
    expect(uploadBuffer).not.toHaveBeenCalled();
    expect(processed.image.dataURL).toBe(`/api/files/${drawing.id}/image`);
    expect(
      (
        await prisma.drawingFile.findUniqueOrThrow({
          where: {
            drawingId_fileId: { drawingId: drawing.id, fileId: "image" },
          },
        })
      ).s3Key,
    ).toBe(key);
  });

  it("preserves existing managed bytes when later interning fails", async () => {
    const drawing = await createDrawing();
    const bytes = Buffer.from([1, 2, 3, 4]);
    await prisma.drawingFile.create({
      data: {
        drawingId: drawing.id,
        fileId: "existing",
        storage: "db",
        data: bytes,
        mimeType: "image/png",
        sizeBytes: bytes.length,
      },
    });
    const write = vi
      .spyOn(prisma, "$queryRaw")
      .mockRejectedValueOnce(new Error("simulated storage failure"));
    const files: Record<string, any> = {
      existing: { dataURL: "data:image/png;base64,AAAA" },
      fail: { dataURL: "data:image/png;base64,AAAA" },
    };
    try {
      await expect(
        internDrawingFiles(files, ownerId, drawing.id, prisma),
      ).rejects.toThrow("simulated storage failure");
      expect(write).toHaveBeenCalledOnce();
      expect((write.mock.calls[0][0] as Prisma.Sql).values).toContain("fail");
      const row = await prisma.drawingFile.findUniqueOrThrow({
        where: {
          drawingId_fileId: { drawingId: drawing.id, fileId: "existing" },
        },
      });
      expect(row.data && Buffer.from(row.data).equals(bytes)).toBe(true);
    } finally {
      write.mockRestore();
    }
  });

  it.each(["br1:broken", "not-json", "[]"])(
    "keeps all bytes when snapshot files cannot establish references (%s)",
    async (files) => {
      const drawing = await createDrawing();
      await prisma.drawingFile.create({
        data: {
          drawingId: drawing.id,
          fileId: "unknown",
          storage: "db",
          data: Buffer.from([1]),
          mimeType: "image/png",
          sizeBytes: 1,
        },
      });
      await prisma.drawingSnapshot.create({
        data: {
          drawingId: drawing.id,
          version: 1,
          elements: "[]",
          appState: "{}",
          files,
        },
      });
      expect(
        await collectRetainedDrawingFileIds(prisma, drawing.id),
      ).toBeNull();
      mountStorage();
      const res = await request(app)
        .post(`/drawings/${drawing.id}/trim`)
        .send({ confirmName: drawing.name });
      expect(res.status).toBe(200);
      expect(
        await prisma.drawingFile.count({ where: { drawingId: drawing.id } }),
      ).toBe(1);
    },
  );
});
