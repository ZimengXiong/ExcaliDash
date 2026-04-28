-- Track S3-uploaded image files for presigned download URL generation.
CREATE TABLE "S3File" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "userId"    TEXT NOT NULL,
    "s3Key"     TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "S3File_userId_idx" ON "S3File"("userId");
