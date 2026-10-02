-- CreateTable
CREATE TABLE "CollectionShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "granteeUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'view',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollectionShare_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionShare_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CollectionShare_collectionId_idx" ON "CollectionShare"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionShare_granteeUserId_idx" ON "CollectionShare"("granteeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionShare_collectionId_granteeUserId_key" ON "CollectionShare"("collectionId", "granteeUserId");
