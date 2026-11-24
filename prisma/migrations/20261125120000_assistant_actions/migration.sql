-- What the app's assistant showed or did: meals it logged, ideas waiting for a tap, voice notes and
-- the day's greeting.
CREATE TABLE "AssistantAction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT,
  "callId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'open',
  "payload" JSONB NOT NULL,
  "mealItemIds" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssistantAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssistantAction_userId_callId_key" ON "AssistantAction"("userId", "callId");
CREATE INDEX "AssistantAction_userId_createdAt_idx" ON "AssistantAction"("userId", "createdAt");

ALTER TABLE "AssistantAction"
  ADD CONSTRAINT "AssistantAction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
