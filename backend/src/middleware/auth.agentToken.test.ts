import type { NextFunction } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  AGENT_TOKEN_SCOPES,
  generateApiKey,
  serializeApiKeyScopes,
} from "../auth/apiKeys";
import { createAuthMiddleware } from "./auth";
import { createDeps, createRequest, createResponse } from "./authTestHelpers";

// Confinement guarantees for per-drawing agent tokens (ApiKey.drawingId set):
// they authorize only their own drawing's agent routes and are refused
// everywhere else, including other drawings and non-agent routes.
describe("auth middleware drawing-scoped agent tokens", () => {
  const mockScopedKey = (
    prisma: ReturnType<typeof createDeps>["prisma"],
    generated: ReturnType<typeof generateApiKey>,
    drawingId: string,
    scopes: readonly string[] = AGENT_TOKEN_SCOPES,
  ) => {
    prisma.apiKey.findUnique.mockResolvedValue({
      id: "agent-key-1",
      tokenHash: generated.tokenHash,
      scopes: serializeApiKeyScopes(scopes),
      drawingId,
      revokedAt: null,
      user: {
        id: "user-1",
        username: "user1",
        email: "user-1@test.local",
        name: "User One",
        role: "USER",
        mustResetPassword: false,
        isActive: true,
      },
    });
    prisma.apiKey.update.mockResolvedValue({});
  };

  const runRequireAuth = async (
    method: string,
    originalUrl: string,
    { drawingId = "drawing-1", scopes = AGENT_TOKEN_SCOPES } = {},
  ) => {
    const { prisma, authModeService } = createDeps();
    authModeService.getAuthEnabled.mockResolvedValue(true);
    const generated = generateApiKey();
    mockScopedKey(prisma, generated, drawingId, scopes);
    const { requireAuth } = createAuthMiddleware({ prisma, authModeService });
    const req = createRequest({
      method,
      originalUrl,
      url: originalUrl,
      headers: { authorization: `Bearer ${generated.token}` },
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;
    await requireAuth(req, res, next);
    return { req, res, next };
  };

  it("authorizes ops for the scoped drawing and records apiKeyDrawingId", async () => {
    const { req, res, next } = await runRequireAuth(
      "POST",
      "/drawings/drawing-1/ops",
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.apiKeyDrawingId).toBe("drawing-1");
    expect(req.principal).toEqual({ kind: "user", userId: "user-1" });
  });

  it("authorizes summary and elements reads for the scoped drawing", async () => {
    const summary = await runRequireAuth("GET", "/drawings/drawing-1/summary");
    expect(summary.next).toHaveBeenCalledTimes(1);
    expect(summary.res.status).not.toHaveBeenCalled();

    const element = await runRequireAuth(
      "GET",
      "/drawings/drawing-1/elements/element-9",
    );
    expect(element.next).toHaveBeenCalledTimes(1);
    expect(element.res.status).not.toHaveBeenCalled();
  });

  it("rejects agent routes for a different drawing", async () => {
    const { res, next } = await runRequireAuth("POST", "/drawings/drawing-2/ops");
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects non-agent routes on the scoped drawing", async () => {
    const { res, next } = await runRequireAuth("GET", "/drawings/drawing-1");
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects agent-token management routes for a scoped key", async () => {
    const { res, next } = await runRequireAuth(
      "POST",
      "/drawings/drawing-1/agent-tokens",
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects the drawings collection route for a scoped key", async () => {
    const { res, next } = await runRequireAuth("GET", "/drawings");
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a scoped key missing the agent:ops scope", async () => {
    const { res, next } = await runRequireAuth("POST", "/drawings/drawing-1/ops", {
      scopes: ["drawings:write"],
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not attach a scoped key on optionalAuth routes", async () => {
    const { prisma, authModeService } = createDeps();
    authModeService.getAuthEnabled.mockResolvedValue(true);
    const generated = generateApiKey();
    mockScopedKey(prisma, generated, "drawing-1");
    const { optionalAuth } = createAuthMiddleware({ prisma, authModeService });
    const req = createRequest({
      method: "GET",
      originalUrl: "/drawings/drawing-1/history",
      url: "/drawings/drawing-1/history",
      headers: { authorization: `Bearer ${generated.token}` },
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;
    await optionalAuth(req, res, next);
    expect(req.user).toBeUndefined();
    expect(req.authError).toEqual({ code: "INVALID_ACCESS_TOKEN" });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
