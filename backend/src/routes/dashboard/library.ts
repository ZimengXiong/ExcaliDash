import express from "express";
import { DashboardRouteDeps } from "./types";

export const registerLibraryRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps
) => {
  const { prisma, requireAuth, asyncHandler, parseJsonField } = deps;

  app.get("/library", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const libraryId = `user_${req.user.id}`;
    const library = await prisma.library.findUnique({ where: { id: libraryId } });
    if (!library) return res.json({ items: [], version: 0 });

    return res.json({ items: parseJsonField(library.items, []), version: library.version });
  }));

  app.put("/library", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const { items, expectedVersion } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Items must be an array" });
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return res.status(400).json({ error: "expectedVersion must be a non-negative integer" });
    }

    const libraryId = `user_${req.user.id}`;
    const current = await prisma.library.findUnique({ where: { id: libraryId } });
    if (!current) {
      if (expectedVersion !== 0) {
        return res.status(409).json({ items: [], version: 0 });
      }
      try {
        const library = await prisma.library.create({
          data: { id: libraryId, items: JSON.stringify(items), version: 1 },
        });
        return res.json({ items: parseJsonField(library.items, []), version: library.version });
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
      }
    }

    const updated = await prisma.library.updateMany({
      where: { id: libraryId, version: expectedVersion },
      data: { items: JSON.stringify(items), version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      const latest = await prisma.library.findUnique({ where: { id: libraryId } });
      return res.status(409).json({
        items: latest ? parseJsonField(latest.items, []) : [],
        version: latest?.version ?? 0,
      });
    }
    const library = await prisma.library.findUniqueOrThrow({ where: { id: libraryId } });

    return res.json({ items: parseJsonField(library.items, []), version: library.version });
  }));
};
