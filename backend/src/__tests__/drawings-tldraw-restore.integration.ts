import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

// A minimal, well-formed tldraw document snapshot: getSnapshot(store).document.
const tldrawDocument = (extraShapeId?: string) => {
  const store: Record<string, unknown> = {
    "document:document": { id: "document:document", typeName: "document" },
    "page:page": { id: "page:page", typeName: "page", name: "Page 1" },
    "shape:box1": {
      id: "shape:box1",
      typeName: "shape",
      type: "geo",
      x: 10,
      y: 10,
    },
  };
  if (extraShapeId) {
    store[`shape:${extraShapeId}`] = {
      id: `shape:${extraShapeId}`,
      typeName: "shape",
      type: "geo",
      x: 40,
      y: 40,
    };
  }
  return { store, schema: { schemaVersion: 2, sequences: {} } };
};

describe("Drawings - tldraw history restore & shared readonly access", () => {
  const userAgent = "vitest-tldraw-restore";
  let prisma: PrismaClient;
  let app: any;
  let owner: { id: string; email: string };
  let ownerToken: string;

  const tokenFor = (id: string, email: string) => {
    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    return jwt.sign(
      { userId: id, email, type: "access" },
      config.jwtSecret,
      signOptions,
    );
  };

  const agentWithCsrf = async () => {
    const agent = request.agent(app);
    const res = await agent.get("/csrf-token").set("User-Agent", userAgent);
    return {
      agent,
      csrfHeader: res.body.header as string,
      csrfToken: res.body.token as string,
    };
  };

  const post = async (body: unknown) => {
    const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
    return agent
      .post("/drawings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("User-Agent", userAgent)
      .set(csrfHeader, csrfToken)
      .send(body as any);
  };

  const put = async (id: string, body: unknown) => {
    const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
    return agent
      .put(`/drawings/${id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("User-Agent", userAgent)
      .set(csrfHeader, csrfToken)
      .send(body as any);
  };

  const get = async (path: string) => {
    const { agent } = await agentWithCsrf();
    return agent
      .get(path)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("User-Agent", userAgent);
  };

  const restore = async (id: string, snapshotId: string) => {
    const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
    return agent
      .post(`/drawings/${id}/history/${snapshotId}/restore`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("User-Agent", userAgent)
      .set(csrfHeader, csrfToken)
      .send();
  };

  const createLinkShare = async (
    drawingId: string,
    permission: "view" | "edit",
  ) => {
    const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
    const res = await agent
      .post(`/drawings/${drawingId}/link-shares`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("User-Agent", userAgent)
      .set(csrfHeader, csrfToken)
      .send({ permission });
    expect(res.status).toBe(200);
    return res;
  };

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true, registrationEnabled: false },
      create: { id: "default", authEnabled: true, registrationEnabled: false },
    });
  });

  beforeEach(async () => {
    await prisma.drawingSnapshot.deleteMany({});
    await prisma.drawing.deleteMany({});
    await prisma.user.deleteMany({});
    const passwordHash = await bcrypt.hash("password123", 10);
    owner = await prisma.user.create({
      data: { email: "owner-tlr@test.local", passwordHash, name: "Owner" },
      select: { id: true, email: true },
    });
    ownerToken = tokenFor(owner.id, owner.email);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("history snapshot round-trip", () => {
    it("snapshots, previews, and restores a tldraw document verbatim", async () => {
      const v1Doc = tldrawDocument();
      const created = await post({
        name: "TL",
        engine: "tldraw",
        elements: v1Doc,
        appState: { camera: { x: 1, y: 2, z: 1 } },
      });
      expect(created.status).toBe(200);
      const id = created.body.id as string;
      const v1Version = created.body.version as number;

      // Updating snapshots the pre-update (v1) state, then advances to v2.
      const v2Doc = tldrawDocument("box2");
      const updated = await put(id, {
        elements: v2Doc,
        appState: {},
        version: v1Version,
      });
      expect(updated.status).toBe(200);
      expect(updated.body.elements.store["shape:box2"]).toBeTruthy();

      // History lists the v1 snapshot.
      const history = await get(`/drawings/${id}/history`);
      expect(history.status).toBe(200);
      expect(history.body.totalCount).toBe(1);
      const snap = history.body.snapshots[0];
      expect(snap.version).toBe(v1Version);

      // The full snapshot echoes the tldraw document object verbatim (not an
      // excalidraw array); parseJsonField preserves the object shape.
      const full = await get(`/drawings/${id}/history/${snap.id}`);
      expect(full.status).toBe(200);
      expect(full.body.elements).toEqual(v1Doc);
      expect(Array.isArray(full.body.elements)).toBe(false);

      // Restoring returns the drawing to the v1 document verbatim and bumps
      // the version forward (restore is itself a versioned write).
      const restored = await restore(id, snap.id);
      expect(restored.status).toBe(200);
      expect(restored.body.elements).toEqual(v1Doc);
      expect(restored.body.version).toBe(updated.body.version + 1);

      // The stored column round-trips as the tldraw document object.
      const row = await prisma.drawing.findUnique({ where: { id } });
      expect(row?.engine).toBe("tldraw");
      expect(JSON.parse(row!.elements)).toEqual(v1Doc);
      expect(row!.files).toBe("{}");
    });
  });

  describe("shared / link-share readonly access", () => {
    it("serves a view-shared tldraw drawing anonymously and blocks writes", async () => {
      const doc = tldrawDocument();
      const created = await post({ engine: "tldraw", elements: doc, appState: {} });
      const id = created.body.id as string;
      await createLinkShare(id, "view");

      // Anonymous GET succeeds with view access and the tldraw document intact.
      const anonGet = await request(app)
        .get(`/drawings/${id}`)
        .set("User-Agent", userAgent);
      expect(anonGet.status).toBe(200);
      expect(anonGet.body.engine).toBe("tldraw");
      expect(anonGet.body.accessLevel).toBe("view");
      expect(anonGet.body.elements).toEqual(doc);

      // A view share is readonly: an anonymous PUT is rejected (404, not saved).
      const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
      const anonPut = await agent
        .put(`/drawings/${id}`)
        .set("User-Agent", userAgent)
        .set(csrfHeader, csrfToken)
        .send({ elements: tldrawDocument("box2"), appState: {} });
      expect(anonPut.status).toBe(404);

      const row = await prisma.drawing.findUnique({ where: { id } });
      expect(JSON.parse(row!.elements)).toEqual(doc);
    });

    it("lets an edit-shared tldraw drawing accept an anonymous versioned save", async () => {
      const doc = tldrawDocument();
      const created = await post({ engine: "tldraw", elements: doc, appState: {} });
      const id = created.body.id as string;
      await createLinkShare(id, "edit");

      const nextDoc = tldrawDocument("box2");
      const { agent, csrfHeader, csrfToken } = await agentWithCsrf();
      const anonPut = await agent
        .put(`/drawings/${id}`)
        .set("User-Agent", userAgent)
        .set(csrfHeader, csrfToken)
        .send({ elements: nextDoc, appState: {}, version: created.body.version });
      expect(anonPut.status).toBe(200);
      expect(anonPut.body.elements.store["shape:box2"]).toBeTruthy();
    });
  });
});
