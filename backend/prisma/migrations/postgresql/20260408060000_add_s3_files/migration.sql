-- Track S3-uploaded image files for presigned download URL generation.
CREATE TABLE "S3File" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "s3Key"     TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "S3File_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "S3File_userId_idx" ON "S3File"("userId");
