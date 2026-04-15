-- CreateTable
CREATE TABLE "DrawingSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "elements" TEXT NOT NULL,
    "appState" TEXT NOT NULL,
    "files" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrawingSnapshot_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DrawingSnapshot_drawingId_createdAt_idx" ON "DrawingSnapshot"("drawingId", "createdAt");

-- CreateIndex
CREATE INDEX "DrawingSnapshot_createdAt_idx" ON "DrawingSnapshot"("createdAt");
