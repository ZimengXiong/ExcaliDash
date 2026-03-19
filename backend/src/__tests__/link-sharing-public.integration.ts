import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

describe("Link Sharing - Public By Drawing ID", () => {
  const userAgent = "vitest-link-sharing-public";
  let prisma: PrismaClient;
  let app: any;

  let ownerUser: { id: string; email: string };
  let ownerToken: string;

  let ownerAgent: any;
  let ownerCsrfHeaderName: string;
  let ownerCsrfToken: string;

  const createDrawing = async () => {
    return prisma.drawing.create({
      data: {
        name: "Shared Drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: ownerUser.id,
        collectionId: null,
        preview: null,
      },
      select: { id: true, userId: true, name: true },
    });
  };

  beforeAll(async () => {
    await setupTestDb();
    prisma = getTestPrisma();

    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {
        authEnabled: true,
        registrationEnabled: false,
      },
      create: {
        id: "default",
        authEnabled: true,
        registrationEnabled: false,
      },
    });

    const passwordHash = await bcrypt.hash("password123", 10);
    ownerUser = await prisma.user.create({
      data: {
        email: "owner-user@test.local",
        passwordHash,
        name: "Owner User",
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });

    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    ownerToken = jwt.sign(
      { userId: ownerUser.id, email: ownerUser.email, type: "access" },
      config.jwtSecret,
      signOptions
    );

    ownerAgent = request.agent(app);
    const csrfRes = await ownerAgent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    ownerCsrfHeaderName = csrfRes.body.header;
    ownerCsrfToken = csrfRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows anonymous GET when link-share policy is view", async () => {
    const drawing = await createDrawing();

    const linkRes = await ownerAgent
      .post(`/drawings/${drawing.id}/link-shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ permission: "view" });
    expect(linkRes.status).toBe(200);

    const anonGet = await request(app)
      .get(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent);
    expect(anonGet.status).toBe(200);
    expect(anonGet.body?.id).toBe(drawing.id);
    expect(anonGet.body?.accessLevel).toBe("view");

    const anonAgent = request.agent(app);
    const anonCsrfRes = await anonAgent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    const anonCsrfHeaderName = anonCsrfRes.body.header;
    const anonCsrfToken = anonCsrfRes.body.token;

    const anonPut = await anonAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(anonCsrfHeaderName, anonCsrfToken)
      .send({ name: "Should Not Save" });
    expect(anonPut.status).toBe(404);
  });

  it("allows anonymous PUT when link-share policy is edit", async () => {
    const drawing = await createDrawing();

    const linkRes = await ownerAgent
      .post(`/drawings/${drawing.id}/link-shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ permission: "edit" });
    expect(linkRes.status).toBe(200);

    const anonAgent = request.agent(app);
    const anonCsrfRes = await anonAgent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    const anonCsrfHeaderName = anonCsrfRes.body.header;
    const anonCsrfToken = anonCsrfRes.body.token;

    const anonPut = await anonAgent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(anonCsrfHeaderName, anonCsrfToken)
      .send({ name: "Renamed By Anonymous" });
    expect(anonPut.status).toBe(200);
    expect(anonPut.body?.id).toBe(drawing.id);
    expect(anonPut.body?.name).toBe("Renamed By Anonymous");
  });

  it("revokes previous active link-share when creating a new one", async () => {
    const drawing = await createDrawing();

    const first = await ownerAgent
      .post(`/drawings/${drawing.id}/link-shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ permission: "view" });
    expect(first.status).toBe(200);
    const firstShareId = first.body?.share?.id as string;
    expect(typeof firstShareId).toBe("string");

    const second = await ownerAgent
      .post(`/drawings/${drawing.id}/link-shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send({ permission: "edit" });
    expect(second.status).toBe(200);

    const firstRow = await prisma.drawingLinkShare.findUnique({
      where: { id: firstShareId },
      select: { revokedAt: true },
    });
    expect(firstRow?.revokedAt).not.toBeNull();

    const activeCount = await prisma.drawingLinkShare.count({
      where: { drawingId: drawing.id, revokedAt: null },
    });
    expect(activeCount).toBe(1);
  });
});

