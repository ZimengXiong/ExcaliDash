import express from "express";
import { DashboardRouteDeps } from "./types";
import { getUserTrashCollectionId, isTrashCollectionId } from "./trash";

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
    invalidateDrawingsCacheForUser,
    config,
    logAuditEvent,
  } = deps;

  app.get("/collections", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const trashCollectionId = getUserTrashCollectionId(req.user.id);
    await ensureTrashCollection(prisma, req.user.id);

    const rawCollections = await prisma.collection.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    const hasInternalTrash = rawCollections.some((collection) => collection.id === trashCollectionId);
    const collections = rawCollections
      .filter((collection) => !(hasInternalTrash && collection.id === "trash"))
      .map((collection) =>
        collection.id === trashCollectionId
          ? { ...collection, id: "trash", name: "Trash" }
          : collection
      );
    return res.json(collections);
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
        where: { collectionId: id, userId: req.user.id },
        data: { collectionId: null },
      }),
      prisma.collection.deleteMany({ where: { id, userId: req.user.id } }),
    ]);
    invalidateDrawingsCacheForUser(req.user.id);

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
