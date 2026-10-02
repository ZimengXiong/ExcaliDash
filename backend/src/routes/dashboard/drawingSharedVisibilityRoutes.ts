import express from "express";
import type { DrawingRouteContext } from "./drawingRouteContext";

// Recipient-scoped controls for drawings shared *with* the current user.
// Unlike drawingSharingRoutes (owner-only), these endpoints act on the
// caller's own DrawingPermission row so a grantee can manage how a shared
// drawing appears in their personal "Shared with me" list.
export const registerDrawingSharedVisibilityRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const { prisma, requireAuth, asyncHandler } = context;

  // Hide/unhide a drawing shared with the caller from their own list.
  app.patch(
    "/drawings/:id/shared-visibility",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { id } = req.params;

      const hidden = req.body?.hidden;
      if (typeof hidden !== "boolean") {
        return res.status(400).json({
          error: "Validation error",
          message: "`hidden` must be a boolean",
        });
      }

      // Scope strictly to the caller's own grant. This never matches an owner
      // self-permission for someone else's drawing, and returns 404 when the
      // caller has no share, avoiding leaking whether the drawing exists.
      const result = await prisma.drawingPermission.updateMany({
        where: { drawingId: id, granteeUserId: req.user.id },
        data: { hidden },
      });

      if (result.count === 0) {
        return res.status(404).json({ error: "Shared drawing not found" });
      }

      return res.json({ success: true, hidden });
    }),
  );
};
