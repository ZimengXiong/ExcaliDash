import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

describe("Drawings - Shared With Me", () => {
  const userAgent = "vitest-drawings-shared";
  let prisma: PrismaClient;
  let app: any;

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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("does not include drawings you own even if you have a self permission row", async () => {
    const passwordHash = await bcrypt.hash("password123", 10);

    const userA = await prisma.user.create({
      data: {
        email: "user-a@test.local",
        passwordHash,
        name: "User A",
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });

    const userB = await prisma.user.create({
      data: {
        email: "user-b@test.local",
        passwordHash,
        name: "User B",
        role: "USER",
        isActive: true,
      },
      select: { id: true },
    });

    const drawingOwnedByA = await prisma.drawing.create({
      data: {
        name: "Owned by A",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: userA.id,
        collectionId: null,
        version: 1,
      },
      select: { id: true },
    });

    const drawingOwnedByB = await prisma.drawing.create({
      data: {
        name: "Owned by B",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: userB.id,
        collectionId: null,
        version: 1,
      },
      select: { id: true },
    });

    // Simulate a deployment that stores an owner "self" permission row.
    await prisma.drawingPermission.create({
      data: {
        drawingId: drawingOwnedByA.id,
        granteeUserId: userA.id,
        permission: "edit",
        createdByUserId: userA.id,
      },
    });

    // A real share: drawing owned by B is shared to A.
    await prisma.drawingPermission.create({
      data: {
        drawingId: drawingOwnedByB.id,
        granteeUserId: userA.id,
        permission: "view",
        createdByUserId: userB.id,
      },
    });

    const signOptions: SignOptions = { expiresIn: config.jwtAccessExpiresIn as StringValue };
    const tokenA = jwt.sign(
      { userId: userA.id, email: userA.email, type: "access" },
      config.jwtSecret,
      signOptions
    );

    const response = await request(app)
      .get("/drawings/shared")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body?.drawings)).toBe(true);
    const ids = (response.body.drawings as any[]).map((d) => d.id);
    expect(ids).toContain(drawingOwnedByB.id);
    expect(ids).not.toContain(drawingOwnedByA.id);
  });
});

