import express from "express";
import { canViewDrawing, getDrawingAccess } from "../../authz/sharing";
import { matchesIfNoneMatch } from "../../server/ifNoneMatch";
import { toPublicTrashCollectionId } from "./trash";
import type { DrawingRouteContext } from "./drawingRouteContext";
import {
  rawJsonArray,
  rawJsonObject,
  sendJsonWithRawFields,
} from "../../utils/rawJson";

export const registerDrawingReadRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    optionalAuth,
    asyncHandler,
    getRequestPrincipal,
    respondWithAuthErrorIfPresent,
  } = context;
  app.get(
    "/drawings/:id",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const principal = await getRequestPrincipal(req);

      const { id } = req.params;
      const access = await getDrawingAccess({
        prisma,
        principal,
        drawingId: id,
      });
      if (!canViewDrawing(access)) {
        if (respondWithAuthErrorIfPresent(req, res)) return;
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      // The editor never renders the stored thumbnail, which for image-heavy
      // drawings is often larger than the scene. `omitPreview=1` returns
      // only whether one exists.
      const omitPreview =
        req.query.omitPreview === "1" || req.query.omitPreview === "true";
      const drawing = await prisma.drawing.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          elements: true,
          appState: true,
          files: true,
          preview: !omitPreview,
          version: true,
          userId: true,
          collectionId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!drawing) {
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      const isOwner =
        principal?.kind === "user" && principal.userId === drawing.userId;
      // Cheap validator instead of Express hashing a multi-MB body. Every
      // scene/name/collection write bumps updatedAt; access and preview mode
      // change the body too.
      const etag = `W/"drawing-${id}-${drawing.version}-${drawing.updatedAt.getTime()}-${access}-${isOwner ? 1 : 0}-${omitPreview ? 1 : 0}"`;
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, no-cache");
      if (matchesIfNoneMatch(req.headers["if-none-match"], etag)) {
        return res.status(304).end();
      }

      let hasPreview: boolean | undefined;
      if (omitPreview) {
        const previewRow = await prisma.drawing.findFirst({
          where: { id, preview: { not: null }, NOT: { preview: "" } },
          select: { id: true },
        });
        hasPreview = Boolean(previewRow);
      }
      const { elements, appState, files, ...meta } = drawing;
      return sendJsonWithRawFields(
        res,
        {
          ...meta,
          // Collections (and trash mapping) are owner-scoped. For shared/public access, avoid leaking
          // owner collection ids like `trash:<ownerId>` and avoid implying the viewer can organize it.
          collectionId: isOwner
            ? toPublicTrashCollectionId(drawing.collectionId, drawing.userId)
            : null,
          ...(omitPreview ? { hasPreview } : {}),
          accessLevel: access,
        },
        {
          elements: rawJsonArray(elements),
          appState: rawJsonObject(appState),
          files: rawJsonObject(files),
        },
      );
    }),
  );
};
