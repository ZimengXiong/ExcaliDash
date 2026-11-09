import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "net";
import type { Server } from "http";
import bcrypt from "bcrypt";
import { PrismaClient } from "../generated/client";
import { generateApiKey, serializeApiKeyScopes } from "../auth/apiKeys";
import { getTestPrisma, setupTestDb } from "./testUtils";

// Requires a built MCP module: npm --prefix mcp ci && npm --prefix mcp run build
// Hoisted so the flag is set before config is first imported.
vi.hoisted(() => {
  process.env.MCP_ENABLED = "true";
});

const PROTOCOL_VERSION = "2025-06-18";

const createUserWithKey = async (
  prisma: PrismaClient,
  email: string,
  scopes?: string[],
): Promise<{ userId: string; token: string }> => {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash("password123", 4),
      name: email,
      role: "USER",
      isActive: true,
    },
    select: { id: true },
  });
  const generated = generateApiKey();
  await prisma.apiKey.create({
    data: {
      userId: user.id,
      name: "MCP test",
      keyId: generated.keyId,
      tokenHash: generated.tokenHash,
      prefix: generated.prefix,
      scopes: serializeApiKeyScopes(scopes),
    },
  });
  return { userId: user.id, token: generated.token };
};

describe("Built-in MCP endpoint", () => {
  let prisma: PrismaClient;
  let server: Server;
  let baseUrl: string;
  let owner: { userId: string; token: string };
  let other: { userId: string; token: string };
  let collectionsOnly: { userId: string; token: string };

  const rpc = (
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> =>
    fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
    });

  const initialize = (token: string) =>
    rpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "integration-test", version: "0" },
        },
      },
      { Authorization: `Bearer ${token}` },
    );

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    const { app } = await import("../index");

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true, registrationEnabled: false },
      create: { id: "default", authEnabled: true, registrationEnabled: false },
    });

    owner = await createUserWithKey(prisma, "mcp-owner@test.local");
    other = await createUserWithKey(prisma, "mcp-other@test.local");
    collectionsOnly = await createUserWithKey(
      prisma,
      "mcp-collections@test.local",
      ["collections:read"],
    );
    await prisma.drawing.create({
      data: {
        name: "Owner MCP drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: owner.userId,
      },
    });

    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    delete process.env.MCP_ENABLED;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  it("reports that it is enabled", async () => {
    const response = await fetch(`${baseUrl}/mcp/status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enabled: true,
      available: true,
      path: "/api/mcp",
    });
  });

  it("rejects requests without an API key", async () => {
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/Bearer/);
  });

  it("rejects an invalid key and a key without drawings:read", async () => {
    expect((await initialize("exd_invalid_key")).status).toBe(401);
    expect((await initialize(collectionsOnly.token)).status).toBe(401);
  });

  it("runs tools as the key's user and keeps sessions bound to that key", async () => {
    const init = await initialize(owner.token);
    expect(init.status).toBe(200);
    const sessionId = init.headers.get("mcp-session-id");
    expect(sessionId).toBeTruthy();
    const session = {
      Authorization: `Bearer ${owner.token}`,
      "mcp-session-id": sessionId as string,
      "mcp-protocol-version": PROTOCOL_VERSION,
    };

    const initialized = await rpc(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      session,
    );
    expect(initialized.status).toBe(202);

    const call = await rpc(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_drawings", arguments: {} },
      },
      session,
    );
    expect(call.status).toBe(200);
    const payload = (await call.json()) as {
      result?: { content?: Array<{ text?: string }>; isError?: boolean };
    };
    expect(payload.result?.isError).not.toBe(true);
    expect(payload.result?.content?.[0]?.text).toContain("Owner MCP drawing");

    const hijack = await rpc(
      { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
      { ...session, Authorization: `Bearer ${other.token}` },
    );
    expect(hijack.status).toBe(404);
  });

  it("does not show another user's drawings", async () => {
    const init = await initialize(other.token);
    const session = {
      Authorization: `Bearer ${other.token}`,
      "mcp-session-id": init.headers.get("mcp-session-id") as string,
      "mcp-protocol-version": PROTOCOL_VERSION,
    };
    await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, session);
    const call = await rpc(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_drawings", arguments: {} },
      },
      session,
    );
    const payload = (await call.json()) as {
      result?: { content?: Array<{ text?: string }> };
    };
    expect(payload.result?.content?.[0]?.text).not.toContain(
      "Owner MCP drawing",
    );
  });
});
