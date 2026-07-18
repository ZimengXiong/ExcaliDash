ALTER TABLE "DrawingLinkShare" ADD COLUMN "policyKey" TEXT;
UPDATE "DrawingLinkShare" SET "policyKey" = 'legacy:' || "id";
WITH current_rows AS (
  SELECT "id", row_number() OVER (PARTITION BY "drawingId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
  FROM "DrawingLinkShare" WHERE "revokedAt" IS NULL
)
UPDATE "DrawingLinkShare" s SET "policyKey" = 'current:' || s."drawingId"
FROM current_rows c WHERE s."id" = c."id" AND c.rn = 1;
UPDATE "DrawingLinkShare" SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL AND "policyKey" LIKE 'legacy:%';
ALTER TABLE "DrawingLinkShare" ALTER COLUMN "policyKey" SET NOT NULL;
CREATE UNIQUE INDEX "DrawingLinkShare_policyKey_key" ON "DrawingLinkShare"("policyKey");
