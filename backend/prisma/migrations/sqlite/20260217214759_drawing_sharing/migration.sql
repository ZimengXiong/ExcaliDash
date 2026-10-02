-- CreateTable
CREATE TABLE "DrawingPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingId" TEXT NOT NULL,
    "granteeUserId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DrawingPermission_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DrawingPermission_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DrawingLinkShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "passphraseHash" TEXT,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastUsedAt" DATETIME,
    "lastUsedIp" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DrawingLinkShare_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DrawingPermission_granteeUserId_idx" ON "DrawingPermission"("granteeUserId");

-- CreateIndex
CREATE INDEX "DrawingPermission_drawingId_idx" ON "DrawingPermission"("drawingId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingPermission_drawingId_granteeUserId_key" ON "DrawingPermission"("drawingId", "granteeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingLinkShare_tokenHash_key" ON "DrawingLinkShare"("tokenHash");

-- CreateIndex
CREATE INDEX "DrawingLinkShare_drawingId_idx" ON "DrawingLinkShare"("drawingId");
