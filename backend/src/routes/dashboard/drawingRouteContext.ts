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

export type DrawingRouteContext = DashboardRouteDeps & {
  getRequestPrincipal: (req: express.Request) => Promise<DrawingPrincipal | null>;
  resolveDefaultTtlMs: (permission: "view" | "edit") => number;
  resolveMaxTtlMs: () => number;
  respondWithAuthErrorIfPresent: (
    req: express.Request,
    res: express.Response,
  ) => boolean;
  cleanupS3FilesForDrawing: (drawingId: string, userId: string) => Promise<void>;
  cloneS3FileReferences: (
    sourceDrawingId: string,
    targetDrawingId: string,
    userId: string,
    files: Record<string, any>,
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
  ): Promise<void> => {
    // Delete S3 objects first (when enabled), then the rows. In db-mode the
    // bytes live in the rows themselves, so the deleteMany below reclaims
    // them; it runs in both modes.
    if (isS3Enabled()) {
      const [objects, records] = await Promise.all([
        listS3Objects(drawingS3Prefix(userId, drawingId)),
        prisma.drawingFile.findMany({
          where: { drawingId },
          select: { s3Key: true },
        }),
      ]);
      const keys = new Set<string>(objects.map((object) => object.key));
      for (const record of records) {
        if (record.s3Key) keys.add(record.s3Key);
      }
      await Promise.allSettled([...keys].map((key) => deleteS3Object(key)));
    }

    await prisma.drawingFile.deleteMany({ where: { drawingId } });
  };

  const cloneS3FileReferences = async (
    sourceDrawingId: string,
    targetDrawingId: string,
    userId: string,
    files: Record<string, any>,
  ): Promise<Record<string, any>> => {
    const records = await prisma.drawingFile.findMany({
      where: { drawingId: sourceDrawingId },
    });
    if (records.length === 0) return files;

    const clonedFiles: Record<string, any> = { ...files };
    const cfg = isS3Enabled() ? getS3Config() : null;

    await Promise.all(
      records.map(async (record) => {
        if (record.storage === "s3" && record.s3Key) {
          const extension = record.s3Key.includes(".")
            ? record.s3Key.substring(record.s3Key.lastIndexOf(".") + 1)
            : "bin";
          const targetKey = buildS3Key(
            userId,
            targetDrawingId,
            record.fileId,
            extension,
          );
          await copyS3Object(record.s3Key, targetKey, record.mimeType);
          await prisma.drawingFile.upsert({
            where: {
              drawingId_fileId: {
                drawingId: targetDrawingId,
                fileId: record.fileId,
              },
            },
            create: {
              drawingId: targetDrawingId,
              fileId: record.fileId,
              mimeType: record.mimeType,
              sizeBytes: record.sizeBytes,
              storage: "s3",
              s3Key: targetKey,
              data: null,
            },
            update: {
              storage: "s3",
              s3Key: targetKey,
              data: null,
              mimeType: record.mimeType,
              sizeBytes: record.sizeBytes,
            },
          });
          if (clonedFiles[record.fileId]) {
            clonedFiles[record.fileId] = {
              ...clonedFiles[record.fileId],
              dataURL: cfg?.publicUrl
                ? getPublicUrl(targetKey)
                : `/api/files/${targetDrawingId}/${record.fileId}`,
            };
          }
          return;
        }

        // Database-bytes mode: copy the bytes into a new row for the copy.
        await prisma.drawingFile.upsert({
          where: {
            drawingId_fileId: {
              drawingId: targetDrawingId,
              fileId: record.fileId,
            },
          },
          create: {
            drawingId: targetDrawingId,
            fileId: record.fileId,
            mimeType: record.mimeType,
            sizeBytes: record.sizeBytes,
            storage: "db",
            s3Key: null,
            data: record.data,
          },
          update: {
            storage: "db",
            s3Key: null,
            data: record.data,
            mimeType: record.mimeType,
            sizeBytes: record.sizeBytes,
          },
        });
        if (clonedFiles[record.fileId]) {
          clonedFiles[record.fileId] = {
            ...clonedFiles[record.fileId],
            dataURL: `/api/files/${targetDrawingId}/${record.fileId}`,
          };
        }
      }),
    );

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
