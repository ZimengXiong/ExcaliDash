-- Per-user ChatGPT (Codex OAuth) subscription provider.
-- Admin kill-switch (null = enabled by default).
ALTER TABLE "SystemConfig" ADD COLUMN "aiChatgptEnabled" BOOLEAN;

-- Per-user connection: OAuth tokens billed to the user's own ChatGPT plan,
-- encrypted at rest (AES-256-GCM). Never sent to the browser.
CREATE TABLE "ChatGptConnection" (
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "accountEmail" TEXT,
    "planType" TEXT,
    "needsReconnect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatGptConnection_pkey" PRIMARY KEY ("userId")
);

-- Short-lived pending OAuth authorizations (PKCE verifier + CSRF state).
CREATE TABLE "ChatGptAuthState" (
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatGptAuthState_pkey" PRIMARY KEY ("state")
);
CREATE INDEX "ChatGptAuthState_userId_idx" ON "ChatGptAuthState"("userId");

ALTER TABLE "ChatGptConnection" ADD CONSTRAINT "ChatGptConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
