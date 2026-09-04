-- CreateEnum
CREATE TYPE "AgentTurnStatus" AS ENUM ('running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "AgentTurn" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "turnSequence" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "AgentTurnStatus" NOT NULL DEFAULT 'running',
    "model" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "userPreview" TEXT,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentTurn_sessionId_turnId_key" ON "AgentTurn"("sessionId", "turnId");

-- CreateIndex
CREATE INDEX "AgentTurn_startedAt_idx" ON "AgentTurn"("startedAt");

-- CreateIndex
CREATE INDEX "AgentTurn_userId_startedAt_idx" ON "AgentTurn"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentTurn_sessionId_turnSequence_idx" ON "AgentTurn"("sessionId", "turnSequence");

-- CreateIndex
CREATE INDEX "AgentTurn_channel_startedAt_idx" ON "AgentTurn"("channel", "startedAt");

-- AddForeignKey
ALTER TABLE "AgentTurn" ADD CONSTRAINT "AgentTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
