import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

describe("Drawings - Shared With Me hide/unhide", () => {
  const userAgent = "vitest-drawings-shared-hidden";
  let prisma: PrismaClient;
  let app: any;

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

  // supertest agent primed with a CSRF token, required for state-changing verbs.
  const agentWithCsrf = async () => {
    const agent = request.agent(app);
    const res = await agent.get("/csrf-token").set("User-Agent", userAgent);
    return {
      agent,
      csrfHeader: res.body.header as string,
      csrfToken: res.body.token as string,
    };
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

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("hides a shared drawing from the recipient list and restores it on unhide", async () => {
    const passwordHash = await bcrypt.hash("password123", 10);

    const owner = await prisma.user.create({
      data: { email: "owner-h@test.local", passwordHash, name: "Owner" },
      select: { id: true, email: true },
    });
    const recipient = await prisma.user.create({
      data: { email: "recipient-h@test.local", passwordHash, name: "Recipient" },
      select: { id: true, email: true },
    });

    const drawing = await prisma.drawing.create({
      data: {
        name: "Shared drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: owner.id,
        version: 1,
      },
      select: { id: true },
    });

    await prisma.drawingPermission.create({
      data: {
        drawingId: drawing.id,
        granteeUserId: recipient.id,
        permission: "view",
        createdByUserId: owner.id,
      },
    });

    const recipientToken = tokenFor(recipient.id, recipient.email);
    const { agent, csrfHeader, csrfToken } = await agentWithCsrf();

    const initial = await request(app)
      .get("/drawings/shared")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${recipientToken}`);
    expect(initial.status).toBe(200);
    expect((initial.body.drawings as any[]).map((d) => d.id)).toContain(
      drawing.id,
    );

    const hideRes = await agent
      .patch(`/drawings/${drawing.id}/shared-visibility`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${recipientToken}`)
      .set(csrfHeader, csrfToken)
      .send({ hidden: true });
    expect(hideRes.status).toBe(200);
    expect(hideRes.body).toMatchObject({ success: true, hidden: true });

    const afterHide = await request(app)
      .get("/drawings/shared")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${recipientToken}`);
    expect(afterHide.status).toBe(200);
    expect((afterHide.body.drawings as any[]).map((d) => d.id)).not.toContain(
      drawing.id,
    );
    expect(afterHide.body.totalCount).toBe(0);

    const unhideRes = await agent
      .patch(`/drawings/${drawing.id}/shared-visibility`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${recipientToken}`)
      .set(csrfHeader, csrfToken)
      .send({ hidden: false });
    expect(unhideRes.status).toBe(200);

    const afterUnhide = await request(app)
      .get("/drawings/shared")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${recipientToken}`);
    expect((afterUnhide.body.drawings as any[]).map((d) => d.id)).toContain(
      drawing.id,
    );
  });

  it("rejects a non-recipient and non-boolean payloads", async () => {
    const passwordHash = await bcrypt.hash("password123", 10);

    const owner = await prisma.user.create({
      data: { email: "owner-h2@test.local", passwordHash, name: "Owner 2" },
      select: { id: true, email: true },
    });
    const stranger = await prisma.user.create({
      data: { email: "stranger-h@test.local", passwordHash, name: "Stranger" },
      select: { id: true, email: true },
    });

    const drawing = await prisma.drawing.create({
      data: {
        name: "Not shared with stranger",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: owner.id,
        version: 1,
      },
      select: { id: true },
    });

    const strangerToken = tokenFor(stranger.id, stranger.email);
    const { agent, csrfHeader, csrfToken } = await agentWithCsrf();

    const notFound = await agent
      .patch(`/drawings/${drawing.id}/shared-visibility`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${strangerToken}`)
      .set(csrfHeader, csrfToken)
      .send({ hidden: true });
    expect(notFound.status).toBe(404);

    const badBody = await agent
      .patch(`/drawings/${drawing.id}/shared-visibility`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${strangerToken}`)
      .set(csrfHeader, csrfToken)
      .send({ hidden: "yes" });
    expect(badBody.status).toBe(400);
  });
});
