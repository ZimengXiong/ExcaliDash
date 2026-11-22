import {
  Prisma,
  type DrawingFile,
  type PrismaClient,
} from "./generated/client";
import { isPostgresDatabase } from "./config/databaseUrl";

// Test presence in the database so metadata lookups never return the BLOB.
export const storedFileFilter: Prisma.DrawingFileWhereInput = {
  OR: [
    { storage: "db", data: { not: Buffer.alloc(0) } },
    { storage: "s3", s3Key: { not: "" } },
  ],
};

export const drawingFileByteLength = () =>
  isPostgresDatabase()
    ? Prisma.sql`octet_length("DrawingFile"."data")`
    : Prisma.sql`length("DrawingFile"."data")`;

type FileContent = Pick<
  Prisma.DrawingFileCreateInput,
  | "drawingId"
  | "fileId"
  | "mimeType"
  | "sizeBytes"
  | "storage"
  | "s3Key"
  | "data"
>;

export type StoredFileMetadata = Pick<
  DrawingFile,
  "mimeType" | "storage" | "s3Key"
>;

/** Store an immutable file id without replacing a concurrent winner's bytes. */
export const storeDrawingFileOnce = async (
  prisma: Pick<PrismaClient, "$queryRaw" | "drawingFile">,
  content: FileContent,
): Promise<StoredFileMetadata> => {
  const { drawingId, fileId, mimeType, storage, sizeBytes, s3Key, data } =
    content;
  // Both providers support conditional upserts. First uploads and repairs
  // return only metadata. A concurrent winner keeps its original bytes.
  const rows = await prisma.$queryRaw<StoredFileMetadata[]>(Prisma.sql`
    INSERT INTO "DrawingFile" ("drawingId", "fileId", "mimeType", "storage", "sizeBytes", "s3Key", "data")
    VALUES (${drawingId}, ${fileId}, ${mimeType}, ${storage}, ${sizeBytes ?? 0}, ${s3Key ?? null}, ${data ?? null})
    ON CONFLICT ("drawingId", "fileId") DO UPDATE SET
      "mimeType" = excluded."mimeType", "storage" = excluded."storage",
      "sizeBytes" = excluded."sizeBytes", "s3Key" = excluded."s3Key", "data" = excluded."data"
    WHERE ("DrawingFile"."storage" = 'db' AND COALESCE(${drawingFileByteLength()}, 0) = 0)
       OR ("DrawingFile"."storage" = 's3' AND COALESCE("DrawingFile"."s3Key", '') = '')
    RETURNING "mimeType", "storage", "s3Key"`);
  if (rows.length) return rows[0];
  return prisma.drawingFile.findUniqueOrThrow({
    where: { drawingId_fileId: { drawingId, fileId } },
    select: { mimeType: true, storage: true, s3Key: true },
  });
};
