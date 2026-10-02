-- Replace S3File with a unified DrawingFile table that backs both storage
-- backends:
--   storage = "db": image bytes live in the `data` BYTEA column.
--   storage = "s3": bytes live in S3 at `s3Key`; `data` is NULL.
--
-- Existing S3File rows already have their bytes in S3, so they migrate as
-- storage='s3' with data=NULL. Their original size is unknown (S3File never
-- tracked it), so sizeBytes defaults to 0 — an informational field only.

CREATE TABLE "DrawingFile" (
    "drawingId" TEXT NOT NULL,
    "fileId"    TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storage"   TEXT NOT NULL,
    "s3Key"     TEXT,
    "data"      BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingFile_pkey" PRIMARY KEY ("drawingId", "fileId")
);

INSERT INTO "DrawingFile"
    ("drawingId", "fileId", "mimeType", "sizeBytes", "storage", "s3Key", "data", "createdAt")
SELECT
    "drawingId", "fileId", "mimeType", 0, 's3', "s3Key", NULL, "createdAt"
FROM "S3File";

DROP TABLE "S3File";

CREATE INDEX "DrawingFile_drawingId_idx" ON "DrawingFile"("drawingId");
