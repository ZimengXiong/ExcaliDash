import { describe, expect, it, vi } from "vitest";
import {
  removeSocketFromRooms,
  revalidateRoomSockets,
  type PresenceUser,
  type SocketState,
} from "./socketAccess";
import type { PrismaClient } from "../generated/client";

const presenceUser = (socketId: string, id = socketId): PresenceUser => ({
  id,
  name: id,
  initials: "U",
  color: "#4f46e5",
  socketId,
  isActive: true,
});

describe("removeSocketFromRooms (B5: no leaked room state)", () => {
  it("deletes a room entry once its last member leaves", () => {
    const roomUsers = new Map<string, PresenceUser[]>([
      ["drawing_a", [presenceUser("s1")]],
    ]);

    const changed = removeSocketFromRooms(roomUsers, ["drawing_a"], "s1");

    expect(changed).toEqual(["drawing_a"]);
    // Empty room must be removed, not left as an empty array.
    expect(roomUsers.has("drawing_a")).toBe(false);
    expect(roomUsers.size).toBe(0);
  });

  it("keeps a room with remaining members and reports the change", () => {
    const roomUsers = new Map<string, PresenceUser[]>([
      ["drawing_a", [presenceUser("s1"), presenceUser("s2")]],
    ]);

    const changed = removeSocketFromRooms(roomUsers, ["drawing_a"], "s1");

    expect(changed).toEqual(["drawing_a"]);
    expect(roomUsers.get("drawing_a")).toEqual([presenceUser("s2")]);
  });

  it("only touches the rooms it is told to scan", () => {
    const roomUsers = new Map<string, PresenceUser[]>([
      ["drawing_a", [presenceUser("s1")]],
      ["drawing_b", [presenceUser("s1"), presenceUser("s2")]],
    ]);

    // Socket s1 only ever joined drawing_a; disconnect scans only its joined rooms.
    const changed = removeSocketFromRooms(roomUsers, ["drawing_a"], "s1");

    expect(changed).toEqual(["drawing_a"]);
    expect(roomUsers.has("drawing_a")).toBe(false);
    // drawing_b is untouched even though s1 also appears there.
    expect(roomUsers.get("drawing_b")).toHaveLength(2);
  });
});

type FakePrismaConfig = {
  ownerUserId?: string;
  permission?: "view" | "edit" | null;
  linkPermission?: "view" | "edit" | null;
  collectionId?: string | null;
};

// Minimal prisma double that drives the real getDrawingAccess logic.
const fakePrisma = (cfg: FakePrismaConfig): PrismaClient => {
  const drawingRow = {
    userId: cfg.ownerUserId ?? "owner-user",
    collectionId: cfg.collectionId ?? null,
  };
  return {
    drawing: { findUnique: vi.fn().mockResolvedValue(drawingRow) },
    drawingPermission: {
      findUnique: vi
        .fn()
        .mockResolvedValue(cfg.permission ? { permission: cfg.permission } : null),
    },
    collection: { findFirst: vi.fn().mockResolvedValue(null) },
    collectionShare: { findFirst: vi.fn().mockResolvedValue(null) },
    drawingLinkShare: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          cfg.linkPermission ? { permission: cfg.linkPermission } : null,
        ),
    },
  } as unknown as PrismaClient;
};

const makeSocket = (id: string, principal: SocketState["principal"]) => {
  const emit = vi.fn();
  const disconnect = vi.fn();
  return {
    socket: {
      id,
      data: { principal, access: new Map(), joinedRooms: new Set(["drawing_d1"]) },
      emit,
      disconnect,
    },
    emit,
    disconnect,
  };
};

describe("revalidateRoomSockets (B15: kick revoked collaborators)", () => {
  it("disconnects a member whose permission was revoked and clears presence", async () => {
    const roomUsers = new Map<string, PresenceUser[]>([
      ["drawing_d1", [presenceUser("s-revoked", "grantee"), presenceUser("s-owner", "owner-user")]],
    ]);
    const emitPresence = vi.fn();
    const { socket, disconnect, emit } = makeSocket("s-revoked", {
      kind: "user",
      userId: "grantee",
    });

    await revalidateRoomSockets({
      // No perm, no link, not owner -> access "none".
      prisma: fakePrisma({ ownerUserId: "owner-user", permission: null, linkPermission: null }),
      drawingId: "d1",
      roomUsers,
      sockets: [socket],
      emitPresence,
    });

    expect(disconnect).toHaveBeenCalledWith(true);
    expect(emit).toHaveBeenCalledWith("error", expect.objectContaining({ message: expect.any(String) }));
    // Revoked user removed from presence; owner remains.
    expect(roomUsers.get("drawing_d1")).toEqual([presenceUser("s-owner", "owner-user")]);
    expect(emitPresence).toHaveBeenCalledWith("drawing_d1", [presenceUser("s-owner", "owner-user")]);
    expect(socket.data.joinedRooms.has("drawing_d1")).toBe(false);
  });

  it("keeps a collaborator who still has access and refreshes their cache", async () => {
    const roomUsers = new Map<string, PresenceUser[]>([
      ["drawing_d1", [presenceUser("s-editor", "editor")]],
    ]);
    const emitPresence = vi.fn();
    const { socket, disconnect } = makeSocket("s-editor", {
      kind: "user",
      userId: "editor",
    });

    await revalidateRoomSockets({
      prisma: fakePrisma({ ownerUserId: "owner-user", permission: "edit", linkPermission: null }),
      drawingId: "d1",
      roomUsers,
      sockets: [socket],
      emitPresence,
    });

    expect(disconnect).not.toHaveBeenCalled();
    expect(roomUsers.get("drawing_d1")).toHaveLength(1);
    expect(socket.data.access.get("d1")).toEqual(
      expect.objectContaining({ access: "edit" }),
    );
  });

  it("keeps the owner connected when a link share is revoked", async () => {
    const roomUsers = new Map<string, PresenceUser[]>([
      ["drawing_d1", [presenceUser("s-owner", "owner-user")]],
    ]);
    const { socket, disconnect } = makeSocket("s-owner", {
      kind: "user",
      userId: "owner-user",
    });

    await revalidateRoomSockets({
      prisma: fakePrisma({ ownerUserId: "owner-user", linkPermission: null }),
      drawingId: "d1",
      roomUsers,
      sockets: [socket],
      emitPresence: vi.fn(),
    });

    expect(disconnect).not.toHaveBeenCalled();
    expect(socket.data.access.get("d1")).toEqual(
      expect.objectContaining({ access: "owner" }),
    );
  });
});
