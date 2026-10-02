import express from "express";
import { DashboardRouteDeps } from "./types";
import { getUserTrashCollectionId, isTrashCollectionId } from "./trash";

export const registerCollectionRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps,
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

  // GET /collections — returns owned collections + collections shared with user
  app.get(
    "/collections",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const trashCollectionId = getUserTrashCollectionId(req.user.id);
      await ensureTrashCollection(prisma, req.user.id);

      const rawCollections = await prisma.collection.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
      });
      const hasInternalTrash = rawCollections.some(
        (c) => c.id === trashCollectionId,
      );
      const shareCountMap = await prisma.collectionShare.groupBy({
        by: ["collectionId"],
        where: {
          collectionId: {
            in: rawCollections.map((c) => c.id),
          },
        },
        _count: { collectionId: true },
      });
      const sharedCollectionIds = new Set(
        shareCountMap.map((s) => s.collectionId),
      );

      const ownedCollections = rawCollections
        .filter((c) => !(hasInternalTrash && c.id === "trash"))
        .map((c) =>
          c.id === trashCollectionId
            ? {
                ...c,
                id: "trash",
                name: "Trash",
                sharedRole: null,
                isOwner: true,
                isShared: false,
              }
            : {
                ...c,
                sharedRole: null,
                isOwner: true,
                isShared: sharedCollectionIds.has(c.id),
              },
        );

      // Collections shared with this user by others
      const sharedEntries = await prisma.collectionShare.findMany({
        where: { granteeUserId: req.user.id },
        include: {
          collection: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
      const sharedCollections = sharedEntries.map((s) => ({
        ...s.collection,
        sharedRole: s.role,
        isOwner: false,
      }));

      return res.json([...ownedCollections, ...sharedCollections]);
    }),
  );

  // POST /collections
  app.post(
    "/collections",
    requireAuth,
    asyncHandler(async (req, res) => {
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
      return res.json({ ...newCollection, sharedRole: null, isOwner: true });
    }),
  );

  // PUT /collections/:id — owner only
  app.put(
    "/collections/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { id } = req.params;
      if (isTrashCollectionId(id, req.user.id)) {
        return res.status(400).json({
          error: "Validation error",
          message: "Trash collection cannot be renamed",
        });
      }
      const existing = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!existing)
        return res.status(404).json({ error: "Collection not found" });

      const parsed = collectionNameSchema.safeParse(req.body.name);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Collection name must be between 1 and 100 characters",
        });
      }

      const sanitizedName = sanitizeText(parsed.data, 100);
      await prisma.collection.updateMany({
        where: { id, userId: req.user.id },
        data: { name: sanitizedName },
      });
      const updated = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!updated)
        return res.status(404).json({ error: "Collection not found" });
      return res.json(updated);
    }),
  );

  // DELETE /collections/:id — owner only
  app.delete(
    "/collections/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
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
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      await prisma.$transaction([
        prisma.drawing.updateMany({
          where: { collectionId: id, userId: req.user.id },
          data: { collectionId: null },
        }),
        prisma.collectionShare.deleteMany({ where: { collectionId: id } }),
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
    }),
  );

  // ─── Collection Sharing ───────────────────────────────────────────────────

  // GET /collections/:id/shares — list shares (owner only)
  app.get(
    "/collections/:id/shares",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      const shares = await prisma.collectionShare.findMany({
        where: { collectionId: id },
        include: {
          granteeUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      return res.json({ shares });
    }),
  );

  // POST /collections/:id/shares — add or update a user share (owner only)
  app.post(
    "/collections/:id/shares",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;
      const { identifier, role } = req.body as {
        identifier: string;
        role: string;
      };

      if (!identifier || !["view", "edit"].includes(role)) {
        return res
          .status(400)
          .json({ error: "identifier and role (view|edit) are required" });
      }

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      // Resolve user by email or username
      const grantee = await prisma.user.findFirst({
        where: {
          isActive: true,
          OR: [
            { email: identifier.toLowerCase() },
            { username: identifier },
            { name: identifier },
          ],
        },
        select: { id: true, name: true, email: true },
      });
      if (!grantee) return res.status(404).json({ error: "User not found" });
      if (grantee.id === req.user.id)
        return res.status(400).json({ error: "Cannot share with yourself" });

      const share = await prisma.collectionShare.upsert({
        where: {
          collectionId_granteeUserId: {
            collectionId: id,
            granteeUserId: grantee.id,
          },
        },
        update: { role, updatedAt: new Date() },
        create: {
          collectionId: id,
          granteeUserId: grantee.id,
          role,
          createdByUserId: req.user.id,
        },
        include: {
          granteeUser: { select: { id: true, name: true, email: true } },
        },
      });
      invalidateDrawingsCache();

      return res.json({ share });
    }),
  );

  // PATCH /collections/:id/shares/:userId — update role (owner only)
  app.patch(
    "/collections/:id/shares/:userId",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id, userId } = req.params;
      const { role } = req.body as { role: string };

      if (!["view", "edit"].includes(role)) {
        return res.status(400).json({ error: "role must be view or edit" });
      }

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      const share = await prisma.collectionShare.updateMany({
        where: { collectionId: id, granteeUserId: userId },
        data: { role, updatedAt: new Date() },
      });
      if (share.count === 0)
        return res.status(404).json({ error: "Share not found" });
      invalidateDrawingsCache();

      return res.json({ success: true });
    }),
  );

  // DELETE /collections/:id/shares/:userId — remove a user (owner only)
  app.delete(
    "/collections/:id/shares/:userId",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id, userId } = req.params;

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      await prisma.collectionShare.deleteMany({
        where: { collectionId: id, granteeUserId: userId },
      });
      invalidateDrawingsCache();
      return res.json({ success: true });
    }),
  );

  // GET /collections/:id/share-resolve — search users to share with (owner only)
  app.get(
    "/collections/:id/share-resolve",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;
      const q = String(req.query.q || "").trim();

      if (q.length < 2) return res.json({ users: [] });

      const collection = await prisma.collection.findFirst({
        where: { id, userId: req.user.id },
      });
      if (!collection)
        return res.status(404).json({ error: "Collection not found" });

      // Get already-shared user IDs to exclude them
      const existing = await prisma.collectionShare.findMany({
        where: { collectionId: id },
        select: { granteeUserId: true },
      });
      const excludeIds = [req.user.id, ...existing.map((s) => s.granteeUserId)];

      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          id: { notIn: excludeIds },
          OR: [
            { email: { contains: q } },
            { name: { contains: q } },
            { username: { contains: q } },
          ],
        },
        select: { id: true, name: true, email: true },
        take: 8,
      });

      return res.json({ users });
    }),
  );
};
