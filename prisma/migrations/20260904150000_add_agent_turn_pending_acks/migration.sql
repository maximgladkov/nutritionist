-- CreateTable
CREATE TABLE "AgentTurnPendingAck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTurnPendingAck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTurnPendingAck_userId_channel_createdAt_idx" ON "AgentTurnPendingAck"("userId", "channel", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentTurnPendingAck" ADD CONSTRAINT "AgentTurnPendingAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
