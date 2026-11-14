import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import crypto from "crypto";
import { PrismaClient } from "../generated/client";
import { createAuthModeService } from "../auth/authMode";
import { generateApiKey, serializeApiKeyScopes } from "../auth/apiKeys";
import { hashShareLinkToken } from "../authz/sharing";
import { registerSocketHandlers } from "../server/socket";
import { getTestPrisma, setupTestDb } from "./testUtils";

// The handlers are exercised through a minimal in-memory Socket.IO stand-in so
// the real join-room / element-update code paths run against the real database.
type Handler = (...args: any[]) => unknown;

const createFakeIo = () => {
  const middleware: Array<(socket: any, next: (err?: Error) => void) => any> =
    [];
  let onConnection: Handler = () => {};
  const rooms = new Map<string, Set<string>>();
  const sockets = new Map<string, any>();
  const roomEmits: Array<{ room: string; event: string; payload: unknown }> =
    [];

  const io: any = {
    use: (fn: any) => middleware.push(fn),
    on: (event: string, fn: Handler) => {
      if (event === "connection") onConnection = fn;
    },
    to: (room: string) => ({
      emit: (event: string, payload: unknown) =>
        roomEmits.push({ room, event, payload }),
    }),
    sockets: { adapter: { rooms }, sockets },
  };

  const connect = async (handshake: {
    auth?: Record<string, unknown>;
    cookie?: string;
  }) => {
    const id = `sock-${crypto.randomUUID()}`;
    const handlers = new Map<string, Handler>();
    const emitted: Array<{ event: string; payload: any }> = [];
    const socket: any = {
      id,
      data: {},
      disconnected: false,
      handshake: {
        auth: handshake.auth ?? {},
        headers: handshake.cookie ? { cookie: handshake.cookie } : {},
      },
      on: (event: string, fn: Handler) => handlers.set(event, fn),
      emit: (event: string, payload: any) => emitted.push({ event, payload }),
      join: (room: string) => {
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room)!.add(id);
      },
      leave: (room: string) => rooms.get(room)?.delete(id),
      disconnect: () => {
        socket.disconnected = true;
      },
      to: (room: string) => ({
        emit: (event: string, payload: unknown) =>
          roomEmits.push({ room, event, payload }),
      }),
      volatile: {
        to: (room: string) => ({
          emit: (event: string, payload: unknown) =>
            roomEmits.push({ room, event, payload }),
        }),
      },
    };
    sockets.set(id, socket);
    let error: Error | undefined;
    for (const fn of middleware) {
      await fn(socket, (err?: Error) => {
        if (err) error = err;
      });
      if (error) break;
    }
    if (!error) onConnection(socket);
    return {
      socket,
      error,
      emitted,
      emit: async (event: string, ...args: unknown[]) => {
        await handlers.get(event)?.(...args);
      },
      joinRoom: async (drawingId: string) => {
        let ack: any;
        await handlers.get("join-room")?.(
          { drawingId, user: { id: "spoofed", name: "bot" } },
          (payload: any) => {
            ack = payload;
          },
        );
        return ack?.user as { id: string; name: string } | undefined;
      },
    };
  };

  return { io, connect, roomEmits };
};

describe("Socket.IO handlers with API keys", () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let strangerId: string;
  let drawingId: string;
  let otherDrawingId: string;
  let linkDrawingId: string;
  let fake: ReturnType<typeof createFakeIo>;

  const createUser = async (name: string) =>
    (
      await prisma.user.create({
        data: {
          email: `${name}-${crypto.randomUUID()}@test.local`,
          passwordHash: "unused",
          name,
        },
      })
    ).id;

  const createKey = async (
    userId: string,
    scopes: readonly string[] = ["drawings:read", "drawings:write"],
  ) => {
    const generated = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: "socket handler test",
        keyId: generated.keyId,
        tokenHash: generated.tokenHash,
        prefix: generated.prefix,
        scopes: serializeApiKeyScopes(scopes),
      },
    });
    return { id: apiKey.id, token: generated.token };
  };

  const createDrawing = async (userId: string, name: string) =>
    (
      await prisma.drawing.create({
        data: { name, userId, elements: "[]", appState: "{}" },
      })
    ).id;

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true },
      create: { id: "default", authEnabled: true },
    });
    ownerId = await createUser("Key Owner");
    strangerId = await createUser("Stranger");
    drawingId = await createDrawing(ownerId, "Owned");
    otherDrawingId = await createDrawing(strangerId, "Private");
    linkDrawingId = await createDrawing(strangerId, "Link shared");
    await prisma.drawingLinkShare.create({
      data: {
        drawingId: linkDrawingId,
        permission: "view",
        tokenHash: hashShareLinkToken("link-token"),
        createdByUserId: strangerId,
      },
    });
  });

  beforeEach(() => {
    fake = createFakeIo();
    registerSocketHandlers({
      io: fake.io,
      prisma,
      authModeService: createAuthModeService(prisma, { authEnabledTtlMs: 0 }),
      jwtSecret: "socket-handlers-test-secret",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("joins with the key owner's identity, not the client-supplied one", async () => {
    const key = await createKey(ownerId);
    const client = await fake.connect({ auth: { token: key.token } });

    const user = await client.joinRoom(drawingId);

    expect(user?.id).toBe(ownerId);
    expect(user?.name).toBe("Key Owner");
  });

  it("cannot join drawings the key's owner has no access to", async () => {
    const key = await createKey(ownerId);
    const client = await fake.connect({ auth: { token: key.token } });

    expect(await client.joinRoom(otherDrawingId)).toBeUndefined();
    expect(client.emitted.at(-1)?.payload.message).toMatch(
      /do not have access/,
    );
  });

  it("falls back to an anonymous principal for bad keys, still allowing link shares", async () => {
    const key = await createKey(ownerId);
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });
    const client = await fake.connect({ auth: { token: key.token } });

    expect(await client.joinRoom(drawingId)).toBeUndefined();
    const linkUser = await client.joinRoom(linkDrawingId);
    expect(linkUser?.id).toBe(`anon:${client.socket.id}`);
  });

  it("does not accept an API key from the cookie", async () => {
    const key = await createKey(ownerId);
    const client = await fake.connect({
      cookie: `excalidash-access-token=${key.token}`,
    });

    expect(await client.joinRoom(drawingId)).toBeUndefined();
  });

  it("refuses element updates from read-only keys", async () => {
    const key = await createKey(ownerId, ["drawings:read"]);
    const client = await fake.connect({ auth: { token: key.token } });
    await client.joinRoom(drawingId);

    await client.emit("element-update", { drawingId, elements: [] });

    expect(client.emitted.at(-1)?.payload.message).toMatch(/not authorized/);
    expect(
      fake.roomEmits.filter((e) => e.event === "element-update"),
    ).toHaveLength(0);
  });

  it("broadcasts element updates for keys with drawings:write", async () => {
    const key = await createKey(ownerId);
    const client = await fake.connect({ auth: { token: key.token } });
    await client.joinRoom(drawingId);

    await client.emit("element-update", { drawingId, elements: [] });

    expect(
      fake.roomEmits.filter((e) => e.event === "element-update"),
    ).toHaveLength(1);
  });

  it("stops accepting edits from an open socket once its key is revoked", async () => {
    const key = await createKey(ownerId);
    const client = await fake.connect({ auth: { token: key.token } });
    await client.joinRoom(drawingId);
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });

    await client.emit("element-update", { drawingId, elements: [] });

    expect(client.socket.disconnected).toBe(true);
    expect(client.emitted.at(-1)?.payload.message).toMatch(/no longer valid/);
    expect(
      fake.roomEmits.filter((e) => e.event === "element-update"),
    ).toHaveLength(0);
  });

  it("picks up scope changes on an open socket", async () => {
    const key = await createKey(ownerId);
    const client = await fake.connect({ auth: { token: key.token } });
    await client.joinRoom(drawingId);
    await prisma.apiKey.update({
      where: { id: key.id },
      data: { scopes: "drawings:read" },
    });

    await client.emit("element-update", { drawingId, elements: [] });

    expect(client.socket.disconnected).toBe(false);
    expect(client.emitted.at(-1)?.payload.message).toMatch(/not authorized/);
  });

  it("disconnects a key socket whose owner was deactivated", async () => {
    const userId = await createUser("Soon Inactive");
    const ownDrawing = await createDrawing(userId, "Soon inactive drawing");
    const key = await createKey(userId);
    const client = await fake.connect({ auth: { token: key.token } });
    await client.joinRoom(ownDrawing);
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    await client.emit("element-update", {
      drawingId: ownDrawing,
      elements: [],
    });

    expect(client.socket.disconnected).toBe(true);
  });
});
