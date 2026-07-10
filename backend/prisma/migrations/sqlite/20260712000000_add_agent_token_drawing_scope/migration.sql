-- Per-drawing agent tokens: nullable ApiKey.drawingId scopes a key to a single
-- drawing's agent routes. A nullable column with an implicit NULL default is a
-- valid SQLite ADD COLUMN target even with a foreign-key reference.
ALTER TABLE "ApiKey" ADD COLUMN "drawingId" TEXT REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ApiKey_drawingId_idx" ON "ApiKey"("drawingId");
