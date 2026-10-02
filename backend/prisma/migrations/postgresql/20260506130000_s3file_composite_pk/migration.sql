-- Migrate S3File from a single-column `id` (= fileId) primary key to a
-- composite (drawingId, fileId) primary key.
--
-- Existing keys follow:
--   {prefix}/{userId}/{drawingId}/{fileId}.{ext}
-- Prefixes may contain '/', so drawingId is the path segment immediately
-- before the final filename segment.

CREATE TABLE "new_S3File" (
    "drawingId" TEXT NOT NULL,
    "fileId"    TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "s3Key"     TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "new_S3File_pkey" PRIMARY KEY ("drawingId", "fileId")
);

WITH "parsedS3Keys" AS (
    SELECT
        "id" AS "fileId",
        "userId",
        "s3Key",
        "mimeType",
        "createdAt",
        string_to_array("s3Key", '/') AS "parts"
    FROM "S3File"
)
INSERT INTO "new_S3File"
    ("drawingId", "fileId", "userId", "s3Key", "mimeType", "createdAt")
SELECT
    "parts"[array_length("parts", 1) - 1] AS "drawingId",
    "fileId",
    "userId",
    "s3Key",
    "mimeType",
    "createdAt"
FROM "parsedS3Keys"
WHERE array_length("parts", 1) >= 4
ON CONFLICT DO NOTHING;

DROP TABLE "S3File";
ALTER TABLE "new_S3File" RENAME TO "S3File";

CREATE INDEX "S3File_userId_idx" ON "S3File"("userId");
CREATE INDEX "S3File_drawingId_idx" ON "S3File"("drawingId");
