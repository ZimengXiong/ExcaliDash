-- Migrate S3File from a single-column `id` (= fileId) primary key to a
-- composite (drawingId, fileId) primary key.
--
-- Why: Excalidraw fileIds are content hashes that legitimately repeat
-- across drawings; a global PK on fileId alone meant the second upload
-- of the same image silently overwrote the first row's s3Key, and any
-- prefix-scoped cleanup deleted objects the sibling drawing still
-- needed.
--
-- We preserve existing rows by parsing the drawingId out of the
-- s3Key. Pre-existing keys all follow the layout produced by uploads
-- so far:
--   {prefix}/{userId}/{drawingId}/{fileId}.{ext}
-- Prefixes may contain '/', so the robust parse is "the segment before
-- the final filename segment", not a fixed slash index.

CREATE TABLE "new_S3File" (
    "drawingId" TEXT NOT NULL,
    "fileId"    TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "s3Key"     TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("drawingId", "fileId")
);

-- Extract `drawingId` = the path segment immediately before the final
-- filename segment. SQLite has INSTR + SUBSTR but no native split, so
-- use a recursive CTE to split each key into ordered path segments.
WITH RECURSIVE "s3KeySegments" AS (
    SELECT
        "id" AS "fileId",
        "userId",
        "s3Key",
        "mimeType",
        "createdAt",
        "s3Key" AS "rest",
        NULL AS "segment",
        0 AS "position"
    FROM "S3File"

    UNION ALL

    SELECT
        "fileId",
        "userId",
        "s3Key",
        "mimeType",
        "createdAt",
        CASE
            WHEN INSTR("rest", '/') > 0 THEN SUBSTR("rest", INSTR("rest", '/') + 1)
            ELSE ''
        END AS "rest",
        CASE
            WHEN INSTR("rest", '/') > 0 THEN SUBSTR("rest", 1, INSTR("rest", '/') - 1)
            ELSE "rest"
        END AS "segment",
        "position" + 1 AS "position"
    FROM "s3KeySegments"
    WHERE "rest" <> ''
),
"s3KeySegmentCounts" AS (
    SELECT
        "fileId",
        "s3Key",
        MAX("position") AS "segmentCount"
    FROM "s3KeySegments"
    WHERE "segment" IS NOT NULL
      AND "segment" <> ''
    GROUP BY "fileId", "s3Key"
)
INSERT OR IGNORE INTO "new_S3File"
    ("drawingId", "fileId", "userId", "s3Key", "mimeType", "createdAt")
SELECT
    "segments"."segment" AS "drawingId",
    "segments"."fileId",
    "segments"."userId",
    "segments"."s3Key",
    "segments"."mimeType",
    "segments"."createdAt"
FROM "s3KeySegments" AS "segments"
JOIN "s3KeySegmentCounts" AS "counts"
  ON "counts"."fileId" = "segments"."fileId"
 AND "counts"."s3Key" = "segments"."s3Key"
WHERE "segments"."position" = "counts"."segmentCount" - 1
  AND "counts"."segmentCount" >= 4;

DROP TABLE "S3File";
ALTER TABLE "new_S3File" RENAME TO "S3File";

CREATE INDEX "S3File_userId_idx" ON "S3File"("userId");
CREATE INDEX "S3File_drawingId_idx" ON "S3File"("drawingId");
