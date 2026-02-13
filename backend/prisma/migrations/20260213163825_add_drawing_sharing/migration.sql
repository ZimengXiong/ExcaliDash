-- CreateTable
CREATE TABLE "DrawingShareLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DrawingShareLink_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DrawingShareGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DrawingShareGrant_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DrawingShareGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DrawingShareGrant_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "DrawingShareLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DrawingShareLink_token_key" ON "DrawingShareLink"("token");

-- CreateIndex
CREATE INDEX "DrawingShareLink_drawingId_idx" ON "DrawingShareLink"("drawingId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingShareLink_drawingId_role_key" ON "DrawingShareLink"("drawingId", "role");

-- CreateIndex
CREATE INDEX "DrawingShareGrant_drawingId_userId_idx" ON "DrawingShareGrant"("drawingId", "userId");

-- CreateIndex
CREATE INDEX "DrawingShareGrant_userId_createdAt_idx" ON "DrawingShareGrant"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingShareGrant_drawingId_userId_shareLinkId_key" ON "DrawingShareGrant"("drawingId", "userId", "shareLinkId");
