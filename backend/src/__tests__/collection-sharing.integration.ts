import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb, createTestDrawingPayload } from "./testUtils";

describe("Collections - Sharing", () => {
  const userAgent = "vitest-collection-sharing";
  let prisma: PrismaClient;
  let app: any;
  let seq = 0;

  const signOptions: SignOptions = { expiresIn: config.jwtAccessExpiresIn as StringValue };

  // A per-user supertest agent that carries the JWT and a CSRF token (cookie + header),
  // matching how the browser client authenticates mutating requests.
  const mkUser = async (label: string) => {
    seq += 1;
    const passwordHash = await bcrypt.hash("password123", 10);
    const user = await prisma.user.create({
      data: { email: `${label}-${seq}@test.local`, passwordHash, name: label, role: "USER", isActive: true },
      select: { id: true, email: true },
    });
    const token = jwt.sign(
      { userId: user.id, email: user.email, type: "access" },
      config.jwtSecret,
      signOptions
    );

    const agent = request.agent(app);
    const csrf = await agent.get("/csrf-token").set("User-Agent", userAgent).set("Authorization", `Bearer ${token}`);
    const csrfHeader = (csrf.body?.header as string) || "x-csrf-token";
    const csrfToken = csrf.body?.token as string;
    const withAuth = (r: request.Test) =>
      r.set("User-Agent", userAgent).set("Authorization", `Bearer ${token}`).set(csrfHeader, csrfToken);

    return {
      id: user.id,
      email: user.email,
      get: (url: string) => withAuth(agent.get(url)),
      post: (url: string) => withAuth(agent.post(url)),
      put: (url: string) => withAuth(agent.put(url)),
      del: (url: string) => withAuth(agent.delete(url)),
    };
  };

  const mkCollection = (ownerId: string, name = "C") =>
    prisma.collection.create({ data: { name, userId: ownerId }, select: { id: true } });

  const mkDrawing = (ownerId: string, collectionId: string | null, name = "D") =>
    prisma.drawing.create({
      data: { name, elements: "[]", appState: "{}", files: "{}", userId: ownerId, collectionId, version: 1 },
      select: { id: true },
    });

  const grant = (collectionId: string, granteeUserId: string, permission: "view" | "edit", by: string) =>
    prisma.collectionPermission.create({ data: { collectionId, granteeUserId, permission, createdByUserId: by } });

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

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lists shared collections and lets a grantee browse + open the drawings inside", async () => {
    const a = await mkUser("owner");
    const b = await mkUser("grantee");
    const c = await mkCollection(a.id);
    const d = await mkDrawing(a.id, c.id);
    await grant(c.id, b.id, "edit", a.id);

    const list = await b.get("/collections");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    const row = (list.body as any[]).find((x) => x.id === c.id);
    expect(row?.accessLevel).toBe("edit");

    const browse = await b.get(`/collections/${c.id}/drawings`);
    expect(browse.status).toBe(200);
    expect((browse.body.drawings as any[]).map((x) => x.id)).toContain(d.id);

    const open = await b.get(`/drawings/${d.id}`);
    expect(open.status).toBe(200);
    expect(open.body.id).toBe(d.id);
    expect(open.body.accessLevel).toBe("edit");
  });

  it("view grants are read-only: grantee cannot edit a drawing or add to the collection", async () => {
    const a = await mkUser("owner");
    const b = await mkUser("viewer");
    const c = await mkCollection(a.id);
    const d = await mkDrawing(a.id, c.id);
    await grant(c.id, b.id, "view", a.id);

    expect((await b.get(`/drawings/${d.id}`)).body.accessLevel).toBe("view");
    expect((await b.put(`/drawings/${d.id}`).send({ name: "hacked" })).status).toBe(404);
    expect(
      (await b.post(`/drawings`).send({ ...createTestDrawingPayload({ name: "sneak" }), collectionId: c.id })).status
    ).toBe(404);
  });

  it("an edit grantee can add a drawing, and it becomes visible to the collection owner", async () => {
    const a = await mkUser("owner");
    const b = await mkUser("contributor");
    const c = await mkCollection(a.id);
    await grant(c.id, b.id, "edit", a.id);

    const add = await b.post(`/drawings`).send({ ...createTestDrawingPayload({ name: "from-b" }), collectionId: c.id });
    expect(add.status).toBe(200);
    const addedId = add.body.id as string;

    const ownerBrowse = await a.get(`/collections/${c.id}/drawings`);
    expect((ownerBrowse.body.drawings as any[]).map((x) => x.id)).toContain(addedId);

    const ownerOpen = await a.get(`/drawings/${addedId}`);
    expect(ownerOpen.status).toBe(200);
    expect(ownerOpen.body.accessLevel).toBe("owner");
  });

  it("non-members get 404 on the collection, its drawings, and inherited drawings", async () => {
    const a = await mkUser("owner");
    const stranger = await mkUser("stranger");
    const c = await mkCollection(a.id);
    const d = await mkDrawing(a.id, c.id);

    expect((await stranger.get(`/collections/${c.id}`)).status).toBe(404);
    expect((await stranger.get(`/collections/${c.id}/drawings`)).status).toBe(404);
    expect((await stranger.get(`/drawings/${d.id}`)).status).toBe(404);
  });

  it("only the owner can grant or revoke; editors cannot", async () => {
    const a = await mkUser("owner");
    const b = await mkUser("editor");
    const target = await mkUser("target");
    const c = await mkCollection(a.id);
    await grant(c.id, b.id, "edit", a.id);

    const grantAttempt = await b.post(`/collections/${c.id}/permissions`).send({ granteeUserId: target.id, permission: "view" });
    expect(grantAttempt.status).toBe(404);

    const real = await prisma.collectionPermission.findFirst({ where: { collectionId: c.id, granteeUserId: b.id } });
    const revokeAttempt = await b.del(`/collections/${c.id}/permissions/${real!.id}`);
    expect(revokeAttempt.status).toBe(404);
  });

  it("rejects self-share and sharing the trash collection", async () => {
    const a = await mkUser("owner");
    const c = await mkCollection(a.id);

    expect((await a.post(`/collections/${c.id}/permissions`).send({ granteeUserId: a.id, permission: "edit" })).status).toBe(400);
    expect((await a.post(`/collections/trash/permissions`).send({ granteeUserId: a.id, permission: "edit" })).status).toBe(400);
  });

  it("revoking access takes effect immediately for the collection and its drawings", async () => {
    const a = await mkUser("owner");
    const b = await mkUser("revoked");
    const c = await mkCollection(a.id);
    const d = await mkDrawing(a.id, c.id);
    const perm = await grant(c.id, b.id, "edit", a.id);

    expect((await b.get(`/collections/${c.id}`)).status).toBe(200);
    expect((await a.del(`/collections/${c.id}/permissions/${perm.id}`)).status).toBe(200);
    expect((await b.get(`/collections/${c.id}`)).status).toBe(404);
    expect((await b.get(`/drawings/${d.id}`)).status).toBe(404);
  });

  it("inherited drawing access is the max of direct permission and collection permission", async () => {
    const a = await mkUser("owner");
    const b = await mkUser("mixed");
    const c = await mkCollection(a.id);
    const d = await mkDrawing(a.id, c.id);
    await grant(c.id, b.id, "view", a.id);
    await prisma.drawingPermission.create({
      data: { drawingId: d.id, granteeUserId: b.id, permission: "edit", createdByUserId: a.id },
    });

    expect((await b.get(`/drawings/${d.id}`)).body.accessLevel).toBe("edit");
    expect((await b.put(`/drawings/${d.id}`).send({ name: "ok" })).status).toBe(200);
  });

  it("a non-owner cannot move a drawing between collections, and collection ids are not leaked", async () => {
    const a = await mkUser("owner");
    const b = await mkUser("editor");
    const c = await mkCollection(a.id);
    const d = await mkDrawing(a.id, c.id);
    await grant(c.id, b.id, "edit", a.id);

    expect((await b.put(`/drawings/${d.id}`).send({ collectionId: null })).status).toBe(403);
    expect((await b.get(`/drawings/${d.id}`)).body.collectionId).toBeNull();
  });
});
