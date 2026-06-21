-- Improve dashboard query performance for user-scoped collection and drawing listings.
CREATE INDEX IF NOT EXISTS "Collection_userId_updatedAt_idx"
ON "Collection" ("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Drawing_userId_updatedAt_idx"
ON "Drawing" ("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Drawing_userId_collectionId_updatedAt_idx"
ON "Drawing" ("userId", "collectionId", "updatedAt");
