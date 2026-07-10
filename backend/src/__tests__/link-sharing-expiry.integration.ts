import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

describe("Link Sharing - Expiry Resolution", () => {
  const userAgent = "vitest-link-sharing-expiry";
  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;

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
      select: { id: true },
    });
  };

  const postLinkShare = async (
    drawingId: string,
    permission: "view" | "edit",
    body?: { expiresAt?: string | null },
  ) => {
    const payload: Record<string, unknown> = { permission };
    if (body && Object.prototype.hasOwnProperty.call(body, "expiresAt")) {
      payload.expiresAt = body.expiresAt;
    }
    return ownerAgent
      .post(`/drawings/${drawingId}/link-shares`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set(ownerCsrfHeaderName, ownerCsrfToken)
      .send(payload);
  };

  const createLinkShare = async (
    drawingId: string,
    permission: "view" | "edit",
    body?: { expiresAt?: string | null },
  ) => {
    const response = await postLinkShare(drawingId, permission, body);
    expect(response.status).toBe(200);
    return response;
  };

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

    const passwordHash = await bcrypt.hash("password123", 10);
    ownerUser = await prisma.user.create({
      data: {
        email: "owner-expiry-user@test.local",
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

  it("stores null expiry when view expiresAt is explicitly null", async () => {
    const drawing = await createDrawing();
    const res = await createLinkShare(drawing.id, "view", { expiresAt: null });
    expect(res.body.share.expiresAt).toBeNull();
  });

  it("uses the default expiry when view expiresAt is omitted", async () => {
    const drawing = await createDrawing();
    const res = await createLinkShare(drawing.id, "view");
    const stored = new Date(res.body.share.expiresAt as string).getTime();
    expect(stored).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    expect(stored).toBeLessThan(Date.now() + 31 * DAY_MS);
  });

  it("stores null expiry when edit expiresAt is explicitly null (never auto-disable)", async () => {
    const drawing = await createDrawing();
    const res = await createLinkShare(drawing.id, "edit", { expiresAt: null });
    // A "never auto-disable" edit link must preserve null expiry, not coerce to
    // the default (~7 day) TTL, so it stays valid indefinitely past that window.
    expect(res.body.share.expiresAt).toBeNull();
  });

  it("keeps a null-expiry edit link valid well past the default edit TTL", async () => {
    const drawing = await createDrawing();
    const res = await createLinkShare(drawing.id, "edit", { expiresAt: null });
    expect(res.body.share.expiresAt).toBeNull();

    const stored = await prisma.drawingLinkShare.findUnique({
      where: { id: res.body.share.id },
      select: { expiresAt: true, revokedAt: true },
    });
    // Persisted row carries no expiry: it cannot lapse after the default window.
    expect(stored?.expiresAt).toBeNull();
    expect(stored?.revokedAt).toBeNull();
  });

  it("still uses the default expiry when edit expiresAt is omitted", async () => {
    const drawing = await createDrawing();
    const res = await createLinkShare(drawing.id, "edit");
    const stored = new Date(res.body.share.expiresAt as string).getTime();
    expect(stored).toBeGreaterThan(Date.now() + 6 * DAY_MS);
    expect(stored).toBeLessThan(Date.now() + 8 * DAY_MS);
  });

  it("honors explicit far-future view dates without the edit-link cap", async () => {
    const drawing = await createDrawing();
    const oneYearOut = new Date(Date.now() + 365 * DAY_MS);
    const res = await createLinkShare(drawing.id, "view", {
      expiresAt: oneYearOut.toISOString(),
    });
    const stored = new Date(res.body.share.expiresAt as string).getTime();
    expect(stored).toBeGreaterThan(Date.now() + 180 * DAY_MS);
    expect(Math.abs(stored - oneYearOut.getTime())).toBeLessThan(5 * 60_000);
  });

  it("caps explicit far-future edit dates to max ttl", async () => {
    const drawing = await createDrawing();
    const oneYearOut = new Date(Date.now() + 365 * DAY_MS);
    const res = await createLinkShare(drawing.id, "edit", {
      expiresAt: oneYearOut.toISOString(),
    });
    const stored = new Date(res.body.share.expiresAt as string).getTime();
    expect(stored).toBeGreaterThan(Date.now() + 89 * DAY_MS);
    expect(stored).toBeLessThan(Date.now() + 91 * DAY_MS);
  });

  it("rejects explicit past and invalid expiry values", async () => {
    const drawing = await createDrawing();
    const past = await postLinkShare(drawing.id, "view", {
      expiresAt: new Date(Date.now() - HOUR_MS).toISOString(),
    });
    expect(past.status).toBe(400);
    expect(past.body.message).toBe("Expiry must be at least 1 minute in the future");

    const invalid = await postLinkShare(drawing.id, "view", {
      expiresAt: "not-a-date",
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toBe("Invalid expiry");
  });
});
