import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import type { PrismaClient } from "../generated/client";
import {
  cleanupTestDb,
  getTestPrisma,
  initTestDb,
  setupTestDb,
} from "./testUtils";
import { registerDrawingAgentTokenRoutes } from "../routes/dashboard/drawingAgentTokenRoutes";
import { sanitizeText } from "../security";
import type { DrawingRouteContext } from "../routes/dashboard/drawingRouteContext";

const buildApp = (
  prisma: PrismaClient,
  userId: string,
  options: { impersonatorId?: string } = {},
) => {
  const app = express();
  app.use(express.json());
  const context = {
    prisma,
    requireAuth: (req: any, _res: any, next: any) => {
      req.user = {
        id: userId,
        email: "user@example.test",
        name: "User",
        role: "USER",
        authCredentialType: "jwt",
        impersonatorId: options.impersonatorId,
      };
      req.principal = { kind: "user", userId };
      next();
    },
    asyncHandler:
      (fn: any) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
    sanitizeText,
    logAuditEvent: async () => {},
    config: { nodeEnv: "test", enableAuditLogging: false },
  } as unknown as DrawingRouteContext;
  registerDrawingAgentTokenRoutes(app, context);
  return app;
};

describe("drawing-scoped agent token routes", () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let viewerId: string;

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    const owner = await initTestDb(prisma);
    ownerId = owner.id;
    const viewer = await prisma.user.create({
      data: {
        email: "agent-token-viewer@example.test",
        name: "Viewer",
        passwordHash: "x",
      },
    });
    viewerId = viewer.id;
  });

  afterAll(async () => {
    await cleanupTestDb(prisma);
  });

  beforeEach(async () => {
    await prisma.apiKey.deleteMany({});
    await prisma.drawingPermission.deleteMany({});
    await prisma.drawing.deleteMany({});
  });

  it("creates, lists, and revokes a token without exposing its hash", async () => {
    const drawing = await prisma.drawing.create({
      data: {
        name: "Agent token test",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: ownerId,
      },
    });
    const app = buildApp(prisma, ownerId);

    const created = await request(app)
      .post(`/drawings/${drawing.id}/agent-tokens`)
      .send({ name: "\u0000" });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^exd_/);
    expect(created.body.agentToken.name).toBe("Agent token");
    expect(created.body.agentToken).not.toHaveProperty("tokenHash");

    const stored = await prisma.apiKey.findUnique({
      where: { id: created.body.agentToken.id },
    });
    expect(stored?.tokenHash).not.toBe(created.body.token);
    expect(stored?.drawingId).toBe(drawing.id);
    expect(stored?.scopes).toBe("agent:ops");

    const listed = await request(app).get(
      `/drawings/${drawing.id}/agent-tokens`,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.agentTokens).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain(created.body.token);
    expect(listed.body.agentTokens[0]).not.toHaveProperty("tokenHash");

    const revoked = await request(app).delete(
      `/drawings/${drawing.id}/agent-tokens/${stored?.id}`,
    );
    expect(revoked.status).toBe(200);
    expect(
      await prisma.apiKey.findUnique({ where: { id: stored!.id } }),
    ).toMatchObject({ revokedAt: expect.any(Date) });

    const after = await request(app).get(
      `/drawings/${drawing.id}/agent-tokens`,
    );
    expect(after.body.agentTokens).toEqual([]);
  });

  it("requires owner access and hides drawings from unrelated users", async () => {
    const drawing = await prisma.drawing.create({
      data: {
        name: "Private drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: ownerId,
      },
    });

    const hidden = await request(buildApp(prisma, viewerId)).get(
      `/drawings/${drawing.id}/agent-tokens`,
    );
    expect(hidden.status).toBe(404);

    await prisma.drawingPermission.create({
      data: {
        drawingId: drawing.id,
        granteeUserId: viewerId,
        permission: "view",
        createdByUserId: ownerId,
      },
    });
    const visibleButForbidden = await request(buildApp(prisma, viewerId)).post(
      `/drawings/${drawing.id}/agent-tokens`,
    );
    expect(visibleButForbidden.status).toBe(403);
  });

  it("blocks token management while the owner is being impersonated", async () => {
    const drawing = await prisma.drawing.create({
      data: {
        name: "Impersonation test",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: ownerId,
      },
    });
    const response = await request(
      buildApp(prisma, ownerId, { impersonatorId: "admin-id" }),
    ).post(`/drawings/${drawing.id}/agent-tokens`);

    expect(response.status).toBe(403);
    expect(await prisma.apiKey.count()).toBe(0);
  });
});
