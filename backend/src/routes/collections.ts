/**
 * Collections API routes
 * Extracted from index.ts to reduce god file
 */
import { Router } from "express";
import { PrismaClient } from "../generated/client";
import { invalidateDrawingsCache } from "../utils/cache";

export const createCollectionsRouter = (prisma: PrismaClient) => {
  const router = Router();

  // GET /collections - List all collections
  router.get("/", async (_req, res) => {
    try {
      const collections = await prisma.collection.findMany({
        orderBy: { createdAt: "desc" },
      });
      res.json(collections);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch collections" });
    }
  });

  // POST /collections - Create collection
  router.post("/", async (req, res) => {
    try {
      const { name } = req.body;
      const newCollection = await prisma.collection.create({
        data: { name },
      });
      res.json(newCollection);
    } catch (error) {
      res.status(500).json({ error: "Failed to create collection" });
    }
  });

  // PUT /collections/:id - Update collection
  router.put("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const updatedCollection = await prisma.collection.update({
        where: { id },
        data: { name },
      });
      res.json(updatedCollection);
    } catch (error) {
      res.status(500).json({ error: "Failed to update collection" });
    }
  });

  // DELETE /collections/:id - Delete collection
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.$transaction([
        prisma.drawing.updateMany({
          where: { collectionId: id },
          data: { collectionId: null },
        }),
        prisma.collection.delete({
          where: { id },
        }),
      ]);
      invalidateDrawingsCache();

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete collection" });
    }
  });

  return router;
};
