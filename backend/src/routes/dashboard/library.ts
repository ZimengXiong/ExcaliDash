import express from "express";
import { DashboardRouteDeps } from "./types";

export const registerLibraryRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps,
) => {
  const { prisma, requireAuth, asyncHandler, parseJsonField } = deps;

  app.get(
    "/library",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const libraryId = `user_${req.user.id}`;
      const library = await prisma.library.findUnique({
        where: { id: libraryId },
      });
      if (!library) return res.json({ items: [] });

      return res.json({ items: parseJsonField(library.items, []) });
    }),
  );

  app.put(
    "/library",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }

      const libraryId = `user_${req.user.id}`;
      const library = await prisma.library.upsert({
        where: { id: libraryId },
        update: { items: JSON.stringify(items) },
        create: { id: libraryId, items: JSON.stringify(items) },
      });

      return res.json({ items: parseJsonField(library.items, []) });
    }),
  );
};
