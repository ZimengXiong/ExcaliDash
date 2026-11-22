import express from "express";
import { DashboardRouteDeps } from "./types";
import {
  buildS3Key,
  copyS3Object,
  deleteS3Object,
  drawingS3Prefix,
  getPublicUrl,
  getS3Config,
  isS3Enabled,
  listS3Objects,
} from "../../s3";
import { type DrawingPrincipal } from "../../authz/sharing";
import { config } from "../../config";
import { Prisma } from "../../generated/client";
import { isPostgresDatabase } from "../../config/databaseUrl";
import { drawingFileByteLength } from "../../drawingFileStore";

export type DrawingRouteContext = DashboardRouteDeps & {
  getRequestPrincipal: (
    req: express.Request,
  ) => Promise<DrawingPrincipal | null>;
  resolveDefaultTtlMs: (permission: "view" | "edit") => number;
  resolveMaxTtlMs: () => number;
  respondWithAuthErrorIfPresent: (
    req: express.Request,
    res: express.Response,
  ) => boolean;
  cleanupS3FilesForDrawing: (
    drawingId: string,
    userId: string,
    copiedS3Keys?: ReadonlySet<string>,
    options?: { skipDbDelete?: boolean },
  ) => Promise<void>;
  cloneS3FileReferences: (
    sourceDrawingId: string,
    targetDrawingId: string,
    userId: string,
    files: Record<string, any>,
    copiedS3Keys?: Set<string>,
  ) => Promise<Record<string, any>>;
};

export const createDrawingRouteContext = (
  deps: DashboardRouteDeps,
): DrawingRouteContext => {
  const { prisma } = deps;

  const getRequestPrincipal = async (
    req: express.Request,
  ): Promise<DrawingPrincipal | null> => {
    if (req.user?.id) return { kind: "user", userId: req.user.id };
    return null;
  };

  const resolveDefaultTtlMs = (permission: "view" | "edit"): number =>
    permission === "edit"
      ? config.linkShare.editDefaultTtlMs
      : config.linkShare.viewDefaultTtlMs;

  const resolveMaxTtlMs = (): number => config.linkShare.maxTtlMs;

  const respondWithAuthErrorIfPresent = (
    req: express.Request,
    res: express.Response,
  ): boolean => {
    if (!req.authError) return false;
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
    return true;
  };

  const cleanupS3FilesForDrawing = async (
    drawingId: string,
    userId: string,
    copiedS3Keys?: ReadonlySet<string>,
    options?: { skipDbDelete?: boolean },
  ): Promise<void> => {
    let keys = copiedS3Keys;
    if (!keys && isS3Enabled()) {
      const [objects, records] = await Promise.all([
        listS3Objects(drawingS3Prefix(userId, drawingId)),
        prisma.drawingFile.findMany({
          where: { drawingId },
          select: { s3Key: true },
        }),
      ]);
      const discoveredKeys = new Set(objects.map((object) => object.key));
      for (const record of records) {
        if (record.s3Key) discoveredKeys.add(record.s3Key);
      }
      keys = discoveredKeys;
    }
    if (keys?.size) {
      const results = await Promise.allSettled(
        [...keys].map((key) => deleteS3Object(key)),
      );
      for (const result of results) {
        if (result.status === "rejected") {
          console.warn("[s3] Failed to delete drawing file object", {
            drawingId,
            error: result.reason,
          });
        }
      }
    }

    if (!options?.skipDbDelete) {
      await prisma.drawingFile.deleteMany({ where: { drawingId } });
    }
  };

  const cloneS3FileReferences = async (
    sourceDrawingId: string,
    targetDrawingId: string,
    userId: string,
    files: Record<string, any>,
    copiedS3Keys?: Set<string>,
  ): Promise<Record<string, any>> => {
    const clonedFiles: Record<string, any> = { ...files };
    const cfg = isS3Enabled() ? getS3Config() : null;

    // The target is a fresh drawing UUID. Copy local blobs inside the database
    // and return just their IDs for rebasing the scene's file references.
    // PostgreSQL's default Read Committed isolation avoids serialization
    // failures between independent duplicates writing their own fresh UUIDs.
    const [dbFiles, s3Files] = await prisma.$transaction(
      [
        prisma.$queryRaw<{ fileId: string }[]>(Prisma.sql`
        INSERT INTO "DrawingFile" ("drawingId", "fileId", "mimeType", "sizeBytes", "storage", "data")
        SELECT ${targetDrawingId}, "fileId", "mimeType", "sizeBytes", 'db', "data"
        FROM "DrawingFile" WHERE "drawingId" = ${sourceDrawingId}
          AND ("storage" <> 's3' OR COALESCE("s3Key", '') = '')
          AND ${drawingFileByteLength()} > 0
        RETURNING "fileId"`),
        prisma.drawingFile.findMany({
          where: {
            drawingId: sourceDrawingId,
            storage: "s3",
            s3Key: { not: "" },
          },
          select: {
            fileId: true,
            mimeType: true,
            sizeBytes: true,
            s3Key: true,
          },
        }),
      ],
      isPostgresDatabase() ? undefined : { isolationLevel: "Serializable" },
    );
    for (const { fileId } of dbFiles) {
      if (clonedFiles[fileId]) {
        clonedFiles[fileId] = {
          ...clonedFiles[fileId],
          dataURL: `/api/files/${targetDrawingId}/${fileId}`,
        };
      }
    }

    for (let i = 0; i < s3Files.length; i += 8) {
      const results = await Promise.allSettled(
        s3Files.slice(i, i + 8).map(async (record) => {
          const extension = record.s3Key.includes(".")
            ? record.s3Key.substring(record.s3Key.lastIndexOf(".") + 1)
            : "bin";
          const targetKey = buildS3Key(
            userId,
            targetDrawingId,
            record.fileId,
            extension,
          );
          copiedS3Keys?.add(targetKey);
          await copyS3Object(record.s3Key, targetKey, record.mimeType);
          await prisma.drawingFile.create({
            data: {
              drawingId: targetDrawingId,
              fileId: record.fileId,
              mimeType: record.mimeType,
              sizeBytes: record.sizeBytes,
              storage: "s3",
              s3Key: targetKey,
              data: null,
            },
            select: { fileId: true },
          });
          if (clonedFiles[record.fileId]) {
            clonedFiles[record.fileId] = {
              ...clonedFiles[record.fileId],
              dataURL: cfg?.publicUrl
                ? getPublicUrl(targetKey)
                : `/api/files/${targetDrawingId}/${record.fileId}`,
            };
          }
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    }

    return clonedFiles;
  };

  return {
    ...deps,
    getRequestPrincipal,
    resolveDefaultTtlMs,
    resolveMaxTtlMs,
    respondWithAuthErrorIfPresent,
    cleanupS3FilesForDrawing,
    cloneS3FileReferences,
  };
};
