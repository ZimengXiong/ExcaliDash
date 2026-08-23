-- Per-drawing agent tokens: nullable ApiKey.drawingId scopes a key to a single
-- drawing's agent routes. Null keys remain account-wide.
ALTER TABLE "ApiKey" ADD COLUMN "drawingId" TEXT;

-- CreateIndex
CREATE INDEX "ApiKey_drawingId_idx" ON "ApiKey"("drawingId");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
