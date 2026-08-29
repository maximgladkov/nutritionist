-- AlterTable
ALTER TABLE "ChannelIdentity" ADD COLUMN     "threadId" TEXT;

-- CreateTable
CREATE TABLE "MealReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" "MealLabel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMPTZ NOT NULL,
    "leaseUntil" TIMESTAMPTZ,
    "leaseToken" TEXT,
    "lastFiredAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealReminder_enabled_nextRunAt_idx" ON "MealReminder"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "MealReminder_userId_label_key" ON "MealReminder"("userId", "label");

-- AddForeignKey
ALTER TABLE "MealReminder" ADD CONSTRAINT "MealReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
