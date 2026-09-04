-- AlterTable
ALTER TABLE "AgentTurnPendingAck" ALTER COLUMN "text" DROP NOT NULL,
ALTER COLUMN "model" DROP NOT NULL,
ADD COLUMN "sessionId" TEXT,
ADD COLUMN "turnId" TEXT;

-- CreateIndex
CREATE INDEX "AgentTurnPendingAck_sessionId_turnId_idx" ON "AgentTurnPendingAck"("sessionId", "turnId");
