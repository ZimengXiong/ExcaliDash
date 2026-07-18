CREATE TABLE "DrawingChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "drawingId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "thinking" TEXT,
    "status" TEXT NOT NULL DEFAULT 'complete',
    "providerId" TEXT,
    "model" TEXT,
    "reasoningEffort" TEXT,
    "tools" TEXT NOT NULL DEFAULT '[]',
    "batches" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "opErrors" TEXT NOT NULL DEFAULT '[]',
    "providerMetadata" TEXT,
    "turnId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "clientRequestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DrawingChatMessage_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DrawingChatMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DrawingChatMessage_clientRequestId_key" ON "DrawingChatMessage"("clientRequestId");
CREATE INDEX "DrawingChatMessage_drawingId_createdAt_idx" ON "DrawingChatMessage"("drawingId", "createdAt");
CREATE INDEX "DrawingChatMessage_turnId_idx" ON "DrawingChatMessage"("turnId");
CREATE INDEX "DrawingChatMessage_authorUserId_idx" ON "DrawingChatMessage"("authorUserId");
