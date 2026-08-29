import { prisma } from "./prisma.ts";

const TELEGRAM_MESSAGE_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

export function telegramMessageClaimKey(chatId: string, messageId: string) {
  return `telegram-msg:${chatId}:${messageId}`;
}

export async function claimTelegramMessage(chatId: string, messageId: string) {
  const key = telegramMessageClaimKey(chatId, messageId);
  try {
    await prisma.chatSdkEntry.create({
      data: {
        expiresAt: new Date(Date.now() + TELEGRAM_MESSAGE_CLAIM_TTL_MS),
        key,
        value: { messageId },
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }
    return true;
  }
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
