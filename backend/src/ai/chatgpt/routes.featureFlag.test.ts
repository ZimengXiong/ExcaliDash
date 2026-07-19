import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerChatGptRoutes } from "./routes";

describe("ChatGPT routes global AI feature flag", () => {
  it("blocks status, connect, callback, and disconnect consistently", async () => {
    const app = express();
    app.use(express.json());
    const prisma = {
      systemConfig: {
        findUnique: vi.fn().mockResolvedValue({ aiEnabled: false }),
      },
    } as any;
    registerChatGptRoutes({
      app,
      prisma,
      requireAuth: ((req: any, _res: any, next: any) => {
        req.user = {
          id: "user-1",
          authCredentialType: "jwt",
        };
        next();
      }) as any,
      asyncHandler:
        (fn: any) => (req: any, res: any, next: any) =>
          Promise.resolve(fn(req, res, next)).catch(next),
      logAuditEvent: vi.fn(),
      loadAiSettings: vi.fn(),
    });

    const responses = await Promise.all([
      request(app).get("/ai/chatgpt/status"),
      request(app).post("/ai/chatgpt/connect").send({}),
      request(app)
        .post("/ai/chatgpt/callback")
        .send({ redirectUrl: "http://localhost/callback?code=x&state=y" }),
      request(app).post("/ai/chatgpt/disconnect").send({}),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: "AI features disabled",
        code: "AI_FEATURES_DISABLED",
        message: "AI features are disabled by an administrator.",
      });
    }
  });
});
