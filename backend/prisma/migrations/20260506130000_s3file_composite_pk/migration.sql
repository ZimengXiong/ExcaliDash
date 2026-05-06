-- Migrate S3File from a single-column `id` (= fileId) primary key to a
-- composite (drawingId, fileId) primary key.
--
-- Why: Excalidraw fileIds are content hashes that legitimately repeat
-- across drawings; a global PK on fileId alone meant the second upload
-- of the same image silently overwrote the first row's s3Key, and any
-- prefix-scoped cleanup deleted objects the sibling drawing still
-- needed.
--
-- This migration drops the existing S3File rows and recreates the
-- table with the new shape. Public-bucket deployments are unaffected
-- (image dataURLs already encode the bucket URL directly). Private-
-- bucket deployments will see /api/files/:drawingId/:fileId 404 for
-- pre-existing images until each affected drawing is re-saved (the
-- save flow upserts a fresh row per (drawingId, fileId) only when it
-- detects new base64 dataURLs, so legacy rows must be rebuilt by hand
-- if needed). S3 objects themselves are untouched.

DROP TABLE IF EXISTS "S3File";

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
