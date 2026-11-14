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
    setupTestDb();
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

    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    const tokenA = jwt.sign(
      { userId: userA.id, email: userA.email, type: "access" },
      config.jwtSecret,
      signOptions,
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

  it("keeps drawings outside any collection when the user also has a shared collection", async () => {
    const passwordHash = await bcrypt.hash("password123", 10);
    const owner = await prisma.user.create({
      data: {
        email: "unfiled-owner@test.local",
        passwordHash,
        name: "Unfiled Owner",
        role: "USER",
        isActive: true,
      },
      select: { id: true },
    });
    const recipient = await prisma.user.create({
      data: {
        email: "unfiled-recipient@test.local",
        passwordHash,
        name: "Unfiled Recipient",
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });

    const sharedCollection = await prisma.collection.create({
      data: { name: "Shared collection", userId: owner.id },
      select: { id: true },
    });
    await prisma.collectionShare.create({
      data: {
        collectionId: sharedCollection.id,
        granteeUserId: recipient.id,
        role: "view",
        createdByUserId: owner.id,
      },
    });
    const [unfiled, inSharedCollection] = await Promise.all(
      [null, sharedCollection.id].map((collectionId) =>
        prisma.drawing.create({
          data: {
            name: collectionId ? "In shared collection" : "Unfiled",
            elements: "[]",
            appState: "{}",
            files: "{}",
            userId: owner.id,
            collectionId,
            version: 1,
          },
          select: { id: true },
        }),
      ),
    );
    for (const drawing of [unfiled, inSharedCollection]) {
      await prisma.drawingPermission.create({
        data: {
          drawingId: drawing.id,
          granteeUserId: recipient.id,
          permission: "view",
          createdByUserId: owner.id,
        },
      });
    }

    const token = jwt.sign(
      { userId: recipient.id, email: recipient.email, type: "access" },
      config.jwtSecret,
      { expiresIn: config.jwtAccessExpiresIn as StringValue },
    );
    const response = await request(app)
      .get("/drawings/shared")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const ids = (response.body.drawings as any[]).map((d) => d.id);
    // The unfiled drawing is only reachable through Shared with me.
    expect(ids).toContain(unfiled.id);
    // The other one is already listed under the shared collection.
    expect(ids).not.toContain(inSharedCollection.id);
  });
});
