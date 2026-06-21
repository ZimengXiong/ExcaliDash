-- CreateTable
CREATE TABLE "CollectionPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "granteeUserId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CollectionPermission_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CollectionPermission_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CollectionPermission_granteeUserId_idx" ON "CollectionPermission"("granteeUserId");

-- CreateIndex
CREATE INDEX "CollectionPermission_collectionId_idx" ON "CollectionPermission"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPermission_collectionId_granteeUserId_key" ON "CollectionPermission"("collectionId", "granteeUserId");
