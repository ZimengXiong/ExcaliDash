/**
 * Library API routes
 * Extracted from index.ts to reduce god file
 */
import { Router } from "express";
import { PrismaClient } from "../generated/client";

export const createLibraryRouter = (prisma: PrismaClient) => {
  const router = Router();

  // GET /library - Get library items
  router.get("/", async (_req, res) => {
    try {
      const library = await prisma.library.findUnique({
        where: { id: "default" },
      });

      if (!library) {
        return res.json({ items: [] });
      }

      res.json({
        items: JSON.parse(library.items),
      });
    } catch (error) {
      console.error("Failed to fetch library:", error);
      res.status(500).json({ error: "Failed to fetch library" });
    }
  });

  // PUT /library - Update library items
  router.put("/", async (req, res) => {
    try {
      const { items } = req.body;

      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }

      const library = await prisma.library.upsert({
        where: { id: "default" },
        update: {
          items: JSON.stringify(items),
        },
        create: {
          id: "default",
          items: JSON.stringify(items),
        },
      });

      res.json({
        items: JSON.parse(library.items),
      });
    } catch (error) {
      console.error("Failed to update library:", error);
      res.status(500).json({ error: "Failed to update library" });
    }
  });

  return router;
};
