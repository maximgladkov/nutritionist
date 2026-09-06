-- CreateTable
CREATE TABLE "TelegramInboundBurstItem" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "TelegramInboundBurstItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramInboundBurstItem_chatId_messageId_key" ON "TelegramInboundBurstItem"("chatId", "messageId");

-- CreateIndex
CREATE INDEX "TelegramInboundBurstItem_chatId_consumedAt_createdAt_idx" ON "TelegramInboundBurstItem"("chatId", "consumedAt", "createdAt");
