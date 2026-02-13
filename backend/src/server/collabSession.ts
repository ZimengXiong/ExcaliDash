import { PrismaClient } from "../generated/client";

type SceneOp = {
  upsertElements?: any[];
  deleteElementIds?: string[];
  filesDelta?: Record<string, any>;
  appStatePatch?: Record<string, unknown>;
};

type DrawingSession = {
  drawingId: string;
  seq: number;
  dbVersion: number;
  elementsById: Map<string, any>;
  filesById: Record<string, any>;
  appState: Record<string, unknown>;
  dirty: boolean;
  lastTouchedAt: number;
  participants: Set<string>;
  pendingFlushTimer: NodeJS.Timeout | null;
};

type CreateCollabSessionManagerDeps = {
  prisma: PrismaClient;
  flushDebounceMs?: number;
  idleEvictMs?: number;
};

const ALLOWED_APPSTATE_KEYS = new Set([
  "viewBackgroundColor",
  "gridSize",
  "zoom",
  "scrollX",
  "scrollY",
  "theme",
]);

const parseJsonSafely = <T>(rawValue: string | null | undefined, fallback: T): T => {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
};

const sanitizeElements = (elements: unknown): any[] => {
  if (!Array.isArray(elements)) return [];
  return elements.filter((element) => element && typeof element === "object");
};

const sanitizeDeleteIds = (deleteElementIds: unknown): string[] => {
  if (!Array.isArray(deleteElementIds)) return [];
  return deleteElementIds.filter((value): value is string => typeof value === "string");
};

const sanitizeFilesDelta = (filesDelta: unknown): Record<string, any> => {
  if (!filesDelta || typeof filesDelta !== "object") return {};
  const next: Record<string, any> = {};
  for (const [key, value] of Object.entries(filesDelta as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length === 0) continue;
    next[key] = value;
  }
  return next;
};

const sanitizeAppStatePatch = (appStatePatch: unknown): Record<string, unknown> => {
  if (!appStatePatch || typeof appStatePatch !== "object") return {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(appStatePatch as Record<string, unknown>)) {
    if (!ALLOWED_APPSTATE_KEYS.has(key)) continue;
    next[key] = value;
  }
  return next;
};

export const createCollabSessionManager = ({
  prisma,
  flushDebounceMs = 2000,
  idleEvictMs = 5 * 60 * 1000,
}: CreateCollabSessionManagerDeps) => {
  const sessions = new Map<string, DrawingSession>();
  const seenClientOps = new Map<string, number>();

  const ensureSession = async (drawingId: string): Promise<DrawingSession | null> => {
    const existing = sessions.get(drawingId);
    if (existing) {
      existing.lastTouchedAt = Date.now();
      return existing;
    }

    const drawing = await prisma.drawing.findUnique({ where: { id: drawingId } });
    if (!drawing) return null;

    const elements = sanitizeElements(parseJsonSafely(drawing.elements, []));
    const session: DrawingSession = {
      drawingId,
      seq: 0,
      dbVersion: drawing.version,
      elementsById: new Map(elements.map((element) => [String(element.id), element])),
      filesById: parseJsonSafely(drawing.files, {}),
      appState: parseJsonSafely(drawing.appState, {}),
      dirty: false,
      lastTouchedAt: Date.now(),
      participants: new Set(),
      pendingFlushTimer: null,
    };

    sessions.set(drawingId, session);
    return session;
  };

  const getSceneSnapshot = async (drawingId: string) => {
    const session = await ensureSession(drawingId);
    if (!session) return null;
    return {
      drawingId,
      seq: session.seq,
      dbVersion: session.dbVersion,
      elements: Array.from(session.elementsById.values()),
      appState: session.appState,
      files: session.filesById,
    };
  };

  const flushSession = async (drawingId: string): Promise<boolean> => {
    const session = sessions.get(drawingId);
    if (!session) return false;
    if (!session.dirty) return true;

    if (session.pendingFlushTimer) {
      clearTimeout(session.pendingFlushTimer);
      session.pendingFlushTimer = null;
    }

    const elements = Array.from(session.elementsById.values());
    await prisma.drawing.update({
      where: { id: drawingId },
      data: {
        elements: JSON.stringify(elements),
        appState: JSON.stringify(session.appState || {}),
        files: JSON.stringify(session.filesById || {}),
        version: { increment: 1 },
      },
    });

    session.dbVersion += 1;
    session.dirty = false;
    session.lastTouchedAt = Date.now();
    return true;
  };

  const scheduleFlush = (session: DrawingSession) => {
    if (session.pendingFlushTimer) {
      clearTimeout(session.pendingFlushTimer);
    }
    session.pendingFlushTimer = setTimeout(() => {
      void flushSession(session.drawingId).catch((error) => {
        console.error("[collab] failed to flush drawing session", {
          drawingId: session.drawingId,
          error,
        });
      });
    }, flushDebounceMs);
  };

  const applyOps = async (params: {
    drawingId: string;
    clientOpId?: string;
    ops: SceneOp[];
  }): Promise<{ seq: number; duplicate: boolean } | null> => {
    const session = await ensureSession(params.drawingId);
    if (!session) return null;

    const opKey = params.clientOpId ? `${params.drawingId}:${params.clientOpId}` : null;
    if (opKey && seenClientOps.has(opKey)) {
      return { seq: session.seq, duplicate: true };
    }

    for (const op of params.ops) {
      const upsertElements = sanitizeElements(op?.upsertElements);
      for (const element of upsertElements) {
        const id = typeof element.id === "string" ? element.id : null;
        if (!id) continue;
        session.elementsById.set(id, element);
      }

      const deleteElementIds = sanitizeDeleteIds(op?.deleteElementIds);
      for (const deleteId of deleteElementIds) {
        const existing = session.elementsById.get(deleteId);
        if (existing) {
          session.elementsById.set(deleteId, { ...existing, isDeleted: true });
        }
      }

      const filesDelta = sanitizeFilesDelta(op?.filesDelta);
      if (Object.keys(filesDelta).length > 0) {
        session.filesById = {
          ...session.filesById,
          ...filesDelta,
        };
      }

      const appStatePatch = sanitizeAppStatePatch(op?.appStatePatch);
      if (Object.keys(appStatePatch).length > 0) {
        session.appState = {
          ...session.appState,
          ...appStatePatch,
        };
      }
    }

    session.seq += 1;
    session.dirty = true;
    session.lastTouchedAt = Date.now();
    scheduleFlush(session);

    if (opKey) {
      seenClientOps.set(opKey, Date.now());
    }

    return { seq: session.seq, duplicate: false };
  };

  const joinSession = async (drawingId: string, socketId: string) => {
    const session = await ensureSession(drawingId);
    if (!session) return null;
    session.participants.add(socketId);
    session.lastTouchedAt = Date.now();
    return session;
  };

  const leaveSession = async (drawingId: string, socketId: string): Promise<void> => {
    const session = sessions.get(drawingId);
    if (!session) return;
    session.participants.delete(socketId);
    session.lastTouchedAt = Date.now();

    if (session.participants.size === 0) {
      await flushSession(drawingId).catch((error) => {
        console.error("[collab] failed to flush on last participant leave", {
          drawingId,
          error,
        });
      });
    }
  };

  const getMeta = async (drawingId: string) => {
    const session = await ensureSession(drawingId);
    if (!session) return null;
    return {
      drawingId,
      seq: session.seq,
      dbVersion: session.dbVersion,
      dirty: session.dirty,
      lastTouchedAt: session.lastTouchedAt,
    };
  };

  setInterval(() => {
    const now = Date.now();

    for (const [key, seenAt] of seenClientOps.entries()) {
      if (now - seenAt > 10 * 60 * 1000) {
        seenClientOps.delete(key);
      }
    }

    for (const [drawingId, session] of sessions.entries()) {
      const isIdle = now - session.lastTouchedAt > idleEvictMs;
      if (!isIdle || session.participants.size > 0) continue;
      void flushSession(drawingId)
        .catch((error) => {
          console.error("[collab] failed to flush idle session", { drawingId, error });
        })
        .finally(() => {
          sessions.delete(drawingId);
        });
    }
  }, 30_000).unref();

  return {
    getSceneSnapshot,
    applyOps,
    joinSession,
    leaveSession,
    flushSession,
    getMeta,
  };
};

export type CollabSessionManager = ReturnType<typeof createCollabSessionManager>;
