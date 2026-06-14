import express from "express";
import { DashboardRouteDeps } from "./types";
import { getUserTrashCollectionId, isTrashCollectionId } from "./trash";
import {
  getCollectionAccess,
  canViewCollection,
  normalizeDrawingPermission,
} from "../../authz/sharing";

export const registerCollectionRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps
) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    collectionNameSchema,
    sanitizeText,
    ensureTrashCollection,
    invalidateDrawingsCache,
    config,
    logAuditEvent,
  } = deps;

  app.get("/collections", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const trashCollectionId = getUserTrashCollectionId(req.user.id);
    await ensureTrashCollection(prisma, req.user.id);

    const [rawCollections, sharedCollections] = await Promise.all([
      prisma.collection.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.collection.findMany({
        where: {
          userId: { not: req.user.id },
          permissions: { some: { granteeUserId: req.user.id } },
        },
        orderBy: { createdAt: "desc" },
        include: {
          permissions: { where: { granteeUserId: req.user.id }, select: { permission: true } },
        },
      }),
    ]);

    const hasInternalTrash = rawCollections.some((collection) => collection.id === trashCollectionId);
    const owned = rawCollections
      .filter((collection) => !(hasInternalTrash && collection.id === "trash"))
      .map((collection) =>
        collection.id === trashCollectionId
          ? { ...collection, id: "trash", name: "Trash", accessLevel: "owner" }
          : { ...collection, accessLevel: "owner" }
      );
    const shared = sharedCollections.map(({ permissions, ...collection }) => ({
      ...collection,
      accessLevel: normalizeDrawingPermission(permissions[0]?.permission) ?? "view",
    }));

    return res.json([...owned, ...shared]);
  }));

  app.post("/collections", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const parsed = collectionNameSchema.safeParse(req.body.name);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        message: "Collection name must be between 1 and 100 characters",
      });
    }

    const sanitizedName = sanitizeText(parsed.data, 100);
    const newCollection = await prisma.collection.create({
      data: { name: sanitizedName, userId: req.user.id },
    });
    return res.json(newCollection);
  }));

  // Read a single collection the caller owns or has been granted access to.
  app.get("/collections/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const access = await getCollectionAccess({
      prisma,
      principal: { kind: "user", userId: req.user.id },
      collectionId: id,
    });
    if (!canViewCollection(access)) return res.status(404).json({ error: "Collection not found" });

    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection) return res.status(404).json({ error: "Collection not found" });
    return res.json({ ...collection, accessLevel: access });
  }));

  // Browse every drawing in a collection the caller can access (owner sees contributors' drawings too).
  app.get("/collections/:id/drawings", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const access = await getCollectionAccess({
      prisma,
      principal: { kind: "user", userId: req.user.id },
      collectionId: id,
    });
    if (!canViewCollection(access)) return res.status(404).json({ error: "Collection not found" });

    const drawings = await prisma.drawing.findMany({
      where: { collectionId: id },
      select: {
        id: true,
        name: true,
        preview: true,
        version: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const responsePayload = drawings.map(({ userId, ...drawing }) => ({
      ...drawing,
      collectionId: id,
      accessLevel: userId === req.user!.id ? "owner" : access,
    }));

    return res.json({ drawings: responsePayload, totalCount: responsePayload.length });
  }));

  // Owner-only: resolve users by name/email in the context of a collection you own (reduces enumeration risk).
  app.get("/collections/:id/share-resolve", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const q = qRaw.toLowerCase();
    if (q.length < 3) return res.json({ users: [] });

    const collection = await prisma.collection.findUnique({ where: { id }, select: { userId: true } });
    if (!collection || collection.userId !== req.user.id) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: req.user.id },
        OR: [
          { email: { contains: q } },
          { name: { contains: q } },
          { username: { contains: q } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 10,
    });

    return res.json({ users });
  }));

  app.get("/collections/:id/sharing", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    const collection = await prisma.collection.findUnique({ where: { id }, select: { userId: true } });
    if (!collection || collection.userId !== req.user.id) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const permissions = await prisma.collectionPermission.findMany({
      where: { collectionId: id },
      select: {
        id: true,
        granteeUserId: true,
        permission: true,
        createdAt: true,
        updatedAt: true,
        granteeUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ permissions });
  }));

  app.post("/collections/:id/permissions", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    if (id === "trash" || isTrashCollectionId(id, req.user.id)) {
      return res.status(400).json({ error: "Validation error", message: "Cannot share the trash collection" });
    }

    const collection = await prisma.collection.findUnique({ where: { id }, select: { userId: true } });
    if (!collection || collection.userId !== req.user.id) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const granteeUserId = typeof req.body?.granteeUserId === "string" ? req.body.granteeUserId : null;
    const permission = normalizeDrawingPermission(req.body?.permission);
    if (!granteeUserId || !permission) {
      return res.status(400).json({ error: "Validation error", message: "Invalid grantee or permission" });
    }
    if (granteeUserId === req.user.id) {
      return res.status(400).json({ error: "Validation error", message: "Cannot share with yourself" });
    }

    const user = await prisma.user.findUnique({
      where: { id: granteeUserId },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return res.status(404).json({ error: "User not found" });
    }

    const saved = await prisma.collectionPermission.upsert({
      where: {
        collectionId_granteeUserId: { collectionId: id, granteeUserId },
      },
      update: { permission, createdByUserId: req.user.id },
      create: { collectionId: id, granteeUserId, permission, createdByUserId: req.user.id },
      select: {
        id: true,
        granteeUserId: true,
        permission: true,
        createdAt: true,
        updatedAt: true,
        granteeUser: { select: { id: true, name: true, email: true } },
      },
    });

    invalidateDrawingsCache();

    if (config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "collection_shared_user_upsert",
        resource: `collection:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { collectionId: id, granteeUserId, permission },
      });
    }

    return res.json({ permission: saved });
  }));

  app.delete("/collections/:id/permissions/:permId", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id, permId } = req.params;

    const collection = await prisma.collection.findUnique({ where: { id }, select: { userId: true } });
    if (!collection || collection.userId !== req.user.id) {
      return res.status(404).json({ error: "Collection not found" });
    }

    await prisma.collectionPermission.deleteMany({
      where: { id: permId, collectionId: id },
    });
    invalidateDrawingsCache();

    if (config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "collection_shared_user_revoke",
        resource: `collection:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { collectionId: id, permissionId: permId },
      });
    }

    return res.json({ success: true });
  }));

  app.put("/collections/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (isTrashCollectionId(id, req.user.id)) {
      return res.status(400).json({
        error: "Validation error",
        message: "Trash collection cannot be renamed",
      });
    }
    const existingCollection = await prisma.collection.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!existingCollection) return res.status(404).json({ error: "Collection not found" });

    const parsed = collectionNameSchema.safeParse(req.body.name);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        message: "Collection name must be between 1 and 100 characters",
      });
    }

    const sanitizedName = sanitizeText(parsed.data, 100);
    const updateResult = await prisma.collection.updateMany({
      where: { id, userId: req.user.id },
      data: { name: sanitizedName },
    });
    if (updateResult.count === 0) {
      return res.status(404).json({ error: "Collection not found" });
    }
    const updatedCollection = await prisma.collection.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!updatedCollection) {
      return res.status(404).json({ error: "Collection not found" });
    }
    return res.json(updatedCollection);
  }));

  app.delete("/collections/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (isTrashCollectionId(id, req.user.id)) {
      return res.status(400).json({
        error: "Validation error",
        message: "Trash collection cannot be deleted",
      });
    }
    const collection = await prisma.collection.findFirst({
      where: { id, userId: req.user.id },
    });
    if (!collection) return res.status(404).json({ error: "Collection not found" });

    await prisma.$transaction([
      prisma.drawing.updateMany({
        where: { collectionId: id },
        data: { collectionId: null },
      }),
      prisma.collection.deleteMany({ where: { id, userId: req.user.id } }),
    ]);
    invalidateDrawingsCache();

    if (config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "collection_deleted",
        resource: `collection:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { collectionId: id, collectionName: collection.name },
      });
    }

    return res.json({ success: true });
  }));
};
