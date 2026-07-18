import type { PrismaClient } from "../../generated/client";
import { deleteS3Object } from "../../s3";
import type { DrawingFileStagingJournal } from "../../fileProcessing";

type StagedFile = { drawingId: string; fileId: string; s3Key?: string | null };

/**
 * Compensates for file interning which intentionally happens before an
 * import's metadata transaction. It only removes rows observed as absent
 * before staging; pre-existing drawing files are never touched.
 */
export const createStagedDrawingFiles = (): DrawingFileStagingJournal & {
  cleanup: (prisma: Pick<PrismaClient, "drawingFile">) => Promise<void>;
} => {
  const files = new Map<string, StagedFile>();
  return {
    recordNew(drawingId, fileId, s3Key) {
      files.set(`${drawingId}\0${fileId}`, { drawingId, fileId, s3Key });
    },
    async cleanup(prisma) {
      const staged = [...files.values()];
      const deletes = await Promise.allSettled(
        staged.flatMap((file) =>
          file.s3Key ? [deleteS3Object(file.s3Key)] : [],
        ),
      );
      const failures = deletes.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((failure) => failure.reason),
          "Failed to clean up staged S3 objects",
        );
      }
      if (staged.length) {
        await prisma.drawingFile.deleteMany({
          where: {
            OR: staged.map(({ drawingId, fileId }) => ({ drawingId, fileId })),
          },
        });
      }
    },
  };
};
