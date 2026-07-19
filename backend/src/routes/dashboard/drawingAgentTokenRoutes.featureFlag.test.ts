import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerDrawingAgentTokenRoutes } from "./drawingAgentTokenRoutes";

describe("drawing agent token routes global AI feature flag", () => {
  it("blocks list, create, and revoke before token storage is touched", async () => {
    const app = express();
    app.use(express.json());
    const prisma = {
      systemConfig: {
        findUnique: vi.fn().mockResolvedValue({ aiEnabled: false }),
      },
      apiKey: {
        findMany: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    } as any;
    registerDrawingAgentTokenRoutes(app, {
      prisma,
      requireAuth: (req: any, _res: any, next: any) => {
        req.user = { id: "owner-1", authCredentialType: "jwt" };
        req.principal = { kind: "user", userId: "owner-1" };
        next();
      },
      asyncHandler:
        (fn: any) => (req: any, res: any, next: any) =>
          Promise.resolve(fn(req, res, next)).catch(next),
      sanitizeText: (value: unknown) => String(value),
      logAuditEvent: vi.fn(),
      config: { enableAuditLogging: false },
    } as any);

    const responses = await Promise.all([
      request(app).get("/drawings/drawing-1/agent-tokens"),
      request(app).post("/drawings/drawing-1/agent-tokens").send({}),
      request(app).delete("/drawings/drawing-1/agent-tokens/token-1"),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("AI_FEATURES_DISABLED");
    }
    expect(prisma.apiKey.findMany).not.toHaveBeenCalled();
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });
});
