-- Keep legacy rows addressable, then reserve one stable unique identity for
-- the current policy of each drawing. SQLite's unique index makes upsert safe.
ALTER TABLE "DrawingLinkShare" ADD COLUMN "policyKey" TEXT;
UPDATE "DrawingLinkShare" SET "policyKey" = 'legacy:' || "id";
UPDATE "DrawingLinkShare"
SET "policyKey" = 'current:' || "drawingId"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "drawingId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
    FROM "DrawingLinkShare" WHERE "revokedAt" IS NULL
  ) WHERE rn = 1
);
UPDATE "DrawingLinkShare" SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL AND "policyKey" LIKE 'legacy:%';
CREATE UNIQUE INDEX "DrawingLinkShare_policyKey_key" ON "DrawingLinkShare"("policyKey");
