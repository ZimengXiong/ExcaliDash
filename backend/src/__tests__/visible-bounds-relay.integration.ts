import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import type { PrismaClient } from "../generated/client";

const { getDrawingAccessDetails } = vi.hoisted(() => ({
  getDrawingAccessDetails: vi.fn(),
}));
vi.mock("../authz/sharing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../authz/sharing")>()),
  getDrawingAccessDetails,
}));

import { registerSocketHandlers } from "../server/socket";
import { isSceneBounds, MAX_SCENE_COORDINATE } from "../server/sceneBounds";

type Handler = (...args: any[]) => unknown;
type Relay = { from: string; room: string; event: string; payload: any };

const setup = () => {
  const middleware: Handler[] = [];
  let onConnection!: Handler;
  const relays: Relay[] = [];
  const rooms = new Map<string, Set<string>>();
  const sockets = new Map<string, unknown>();
  const io = {
    use: (fn: Handler) => middleware.push(fn),
    on: (event: string, fn: Handler) => {
      if (event === "connection") onConnection = fn;
    },
    to: () => ({ emit: vi.fn() }),
    sockets: { adapter: { rooms }, sockets },
  };
  const { revalidateDrawingAccess } = registerSocketHandlers({
    io: io as unknown as Server,
    prisma: {} as PrismaClient,
    authModeService: { getAuthEnabled: async () => false } as never,
    jwtSecret: "test-secret",
  });
  const connect = async (id: string) => {
    const handlers = new Map<string, Handler>();
    const socket = {
      id,
      data: {},
      handshake: { auth: {}, headers: {} },
      on: (event: string, fn: Handler) => handlers.set(event, fn),
      join: (room: string) => {
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room)!.add(id);
      },
      leave: (room: string) => rooms.get(room)?.delete(id),
      emit: vi.fn(),
      volatile: {
        to: (room: string) => ({
          emit: (event: string, payload: unknown) =>
            relays.push({ from: id, room, event, payload }),
        }),
      },
    };
    await new Promise<void>((resolve, reject) =>
      middleware[0](socket, (err?: Error) => (err ? reject(err) : resolve())),
    );
    sockets.set(id, socket);
    onConnection(socket);
    return {
      id,
      join: (drawingId = "d1", name = id) =>
        handlers.get("join-room")!({
          drawingId,
          user: { id: `claimed-${id}`, name, color: "#112233" },
        }),
      send: (payload: unknown) => handlers.get("visible-bounds")!(payload),
    };
  };
  return { connect, relays, revalidateDrawingAccess };
};

const bounds = [0, 0, 100, 50];

beforeEach(() => {
  getDrawingAccessDetails.mockReset();
  getDrawingAccessDetails.mockResolvedValue({
    access: "edit",
    baseAccess: "edit",
    linkExpiresAt: null,
    trashed: false,
  });
});

describe("visible-bounds relay", () => {
  it("relays a viewport to the drawing's room under the server-side identity", async () => {
    const { connect, relays } = setup();
    const a = await connect("sock-a");
    const b = await connect("sock-b");
    await a.join();
    await b.join();

    await a.send({
      drawingId: "d1",
      bounds,
      following: `anon:sock-b`,
      userId: "spoofed",
    });

    expect(relays).toEqual([
      {
        from: "sock-a",
        room: "drawing_d1",
        event: "visible-bounds",
        payload: {
          drawingId: "d1",
          userId: "anon:sock-a",
          bounds,
          following: "anon:sock-b",
        },
      },
    ]);
  });

  it("lets read-only collaborators share their viewport", async () => {
    getDrawingAccessDetails.mockResolvedValue({
      access: "view",
      baseAccess: "view",
      linkExpiresAt: null,
      trashed: false,
    });
    const { connect, relays } = setup();
    const viewer = await connect("sock-v");
    await viewer.join();
    await viewer.send({ drawingId: "d1", bounds });
    expect(relays).toHaveLength(1);
  });

  it("only passes on a followed id that is in the same drawing", async () => {
    const { connect, relays } = setup();
    const a = await connect("sock-a");
    const outsider = await connect("sock-x");
    await a.join("d1");
    await outsider.join("d2");

    await a.send({ drawingId: "d1", bounds, following: "anon:sock-x" });
    await a.send({ drawingId: "d1", bounds, following: { $ne: null } });
    await a.send({ drawingId: "d1", bounds });

    expect(relays.map((r) => r.payload.following)).toEqual([null, null, null]);
  });

  it("ignores sockets that have not joined the drawing", async () => {
    const { connect, relays } = setup();
    const a = await connect("sock-a");
    const stranger = await connect("sock-s");
    await a.join("d1");
    await stranger.join("d2");

    await stranger.send({ drawingId: "d1", bounds });
    await stranger.send({ drawingId: "never-joined", bounds });
    await stranger.send(undefined);

    expect(relays).toEqual([]);
  });

  it("stops relaying once access to the drawing is revoked", async () => {
    const { connect, relays, revalidateDrawingAccess } = setup();
    const a = await connect("sock-a");
    await a.join();
    await a.send({ drawingId: "d1", bounds });
    expect(relays).toHaveLength(1);

    getDrawingAccessDetails.mockResolvedValue({
      access: "none",
      baseAccess: "none",
      linkExpiresAt: null,
      trashed: false,
    });
    await revalidateDrawingAccess("d1");
    await a.send({ drawingId: "d1", bounds });
    expect(relays).toHaveLength(1);
  });

  it.each([
    ["too short", [0, 0, 100]],
    ["too long", [0, 0, 100, 50, 1]],
    ["not an array", { 0: 0, 1: 0, 2: 100, 3: 50, length: 4 }],
    ["strings", ["0", "0", "100", "50"]],
    ["NaN", [0, NaN, 100, 50]],
    ["Infinity", [0, 0, Infinity, 50]],
    ["inverted x", [100, 0, 0, 50]],
    ["inverted y", [0, 50, 100, 0]],
    ["huge values", [0, 0, 1e300, 1e300]],
    ["overflowing center", [1e308, 0, 1.7e308, 50]],
  ])("drops malformed bounds: %s", async (_name, bad) => {
    const { connect, relays } = setup();
    const a = await connect("sock-a");
    await a.join();
    await a.send({ drawingId: "d1", bounds: bad });
    expect(relays).toEqual([]);
  });
});

describe("isSceneBounds", () => {
  it("accepts ordinary and degenerate viewports within range", () => {
    expect(isSceneBounds([-2500.5, -1200, 3000, 1800])).toBe(true);
    expect(isSceneBounds([5, 5, 5, 5])).toBe(true);
    expect(
      isSceneBounds([
        -MAX_SCENE_COORDINATE,
        -MAX_SCENE_COORDINATE,
        MAX_SCENE_COORDINATE,
        MAX_SCENE_COORDINATE,
      ]),
    ).toBe(true);
    expect(isSceneBounds([0, 0, MAX_SCENE_COORDINATE + 1, 1])).toBe(false);
  });
});
