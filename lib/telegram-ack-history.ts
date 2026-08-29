import { prisma } from "./prisma.ts";
import {
  clipTelegramAckHistory,
  parseTelegramAckHistory,
  type TelegramAckHistoryMessage,
} from "./telegram-ack.ts";

export function telegramAckHistoryKey(providerUserId: string) {
  return `telegram-ack:${providerUserId}`;
}

export async function loadTelegramAckHistory(providerUserId: string) {
  try {
    const row = await prisma.chatSdkEntry.findUnique({
      where: { key: telegramAckHistoryKey(providerUserId) },
    });
    return parseTelegramAckHistory(row?.value);
  } catch {
    return [];
  }
}

export async function appendTelegramAckHistory(
  providerUserId: string,
  messages: readonly TelegramAckHistoryMessage[],
) {
  const key = telegramAckHistoryKey(providerUserId);
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.chatSdkEntry.findUnique({ where: { key } });
      const next = clipTelegramAckHistory([...parseTelegramAckHistory(row?.value), ...messages]);
      await tx.chatSdkEntry.upsert({
        where: { key },
        create: { key, value: next as never },
        update: { value: next as never },
      });
    });
  } catch {
    return;
  }
}
