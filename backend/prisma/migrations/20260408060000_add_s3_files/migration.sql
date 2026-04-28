-- Track S3-uploaded image files for presigned download URL generation.
-- The primary key is composite (drawingId, fileId): Excalidraw fileIds
-- are content hashes that repeat across drawings, so a global PK on
-- fileId alone would let a second upload silently overwrite the first
-- and let cleanup of one drawing trash an object the other still needs.
CREATE TABLE "S3File" (
    "drawingId" TEXT NOT NULL,
    "fileId"    TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "s3Key"     TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("drawingId", "fileId")
);

CREATE INDEX "S3File_userId_idx" ON "S3File"("userId");
CREATE INDEX "S3File_drawingId_idx" ON "S3File"("drawingId");
