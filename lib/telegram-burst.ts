import type { TelegramAttachment, TelegramMessage } from "eve/channels/telegram";
import { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "./prisma.ts";

export const TELEGRAM_BURST_MEDIA_DELAY_MS = 2000;

export type TelegramBurstAttachment = TelegramAttachment;

export type TelegramBurstItem = {
  attachments: TelegramBurstAttachment[];
  caption: string;
  mediaGroupId?: string;
  messageId: string;
  text: string;
};

export type TelegramBurstMerge = {
  attachments: TelegramBurstAttachment[];
  caption: string;
  text: string;
};

type BurstSleep = (ms: number) => Promise<void>;

export function telegramBurstDelayMs(items: readonly { mediaGroupId?: string }[]): number {
  const latest = items.at(-1);
  return latest?.mediaGroupId !== undefined && latest.mediaGroupId.length > 0
    ? TELEGRAM_BURST_MEDIA_DELAY_MS
    : 0;
}

export function telegramMediaGroupId(raw: Record<string, unknown> | undefined): string | undefined {
  const value = raw?.media_group_id;
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

export function mergeTelegramBurstItems(items: readonly TelegramBurstItem[]): TelegramBurstMerge {
  const attachments: TelegramBurstAttachment[] = [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of items) {
    for (const attachment of item.attachments) {
      if (seen.has(attachment.fileId)) {
        continue;
      }
      seen.add(attachment.fileId);
      attachments.push(attachment);
    }
    const text = item.text.trim();
    const caption = item.caption.trim();
    if (text.length > 0) {
      lines.push(text);
      continue;
    }
    if (caption.length > 0) {
      lines.push(caption);
    }
  }
  return {
    attachments,
    caption: "",
    text: lines.join("\n"),
  };
}

export function applyTelegramBurstMerge(message: TelegramMessage, merge: TelegramBurstMerge): void {
  Object.assign(message, {
    attachments: merge.attachments,
    caption: merge.caption,
    text: merge.text,
  });
}

export function telegramBurstItemFromMessage(message: TelegramMessage): TelegramBurstItem {
  const mediaGroupId = telegramMediaGroupId(message.raw);
  return {
    attachments: [...message.attachments],
    caption: message.caption,
    messageId: message.messageId,
    text: message.text,
    ...(mediaGroupId === undefined ? {} : { mediaGroupId }),
  };
}

export async function appendAndClaimTelegramBurst(input: {
  chatId: string;
  item: TelegramBurstItem;
  sleep?: BurstSleep;
}): Promise<TelegramBurstItem[] | null> {
  await appendTelegramBurstItem(input.chatId, input.item);
  const pending = await listUnconsumedTelegramBurstItems(input.chatId);
  await (input.sleep ?? defaultSleep)(telegramBurstDelayMs(pending));
  return claimTelegramBurst(input.chatId, input.item.messageId);
}

async function appendTelegramBurstItem(chatId: string, item: TelegramBurstItem): Promise<void> {
  try {
    await burstItems().create({
      data: {
        attachments: item.attachments as unknown as Prisma.InputJsonValue,
        caption: item.caption,
        chatId,
        mediaGroupId: item.mediaGroupId,
        messageId: item.messageId,
        text: item.text,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }
}

async function listUnconsumedTelegramBurstItems(chatId: string): Promise<TelegramBurstItem[]> {
  const rows = await burstItems().findMany({
    orderBy: { createdAt: "asc" },
    where: { chatId, consumedAt: null },
  });
  return rows.map(fromRow);
}

export function selectTelegramBurstClaim<T extends { messageId: string }>(
  rows: readonly T[],
  messageId: string,
): T[] | null {
  const latest = rows.at(-1);
  if (latest === undefined || latest.messageId !== messageId) {
    return null;
  }
  return [...rows];
}

export async function claimTelegramBurst(chatId: string, messageId: string): Promise<TelegramBurstItem[] | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.telegramInboundBurstItem.findMany({
      orderBy: { createdAt: "asc" },
      where: { chatId, consumedAt: null },
    });
    const claimed = selectTelegramBurstClaim(rows, messageId);
    if (claimed === null) {
      return null;
    }
    const now = new Date();
    const updated = await tx.telegramInboundBurstItem.updateMany({
      data: { consumedAt: now },
      where: {
        consumedAt: null,
        id: { in: rows.map((row) => row.id) },
      },
    });
    if (updated.count === 0) {
      return null;
    }
    return rows.map(fromRow);
  });
}

function fromRow(row: {
  attachments: unknown;
  caption: string;
  mediaGroupId: string | null;
  messageId: string;
  text: string;
}): TelegramBurstItem {
  return {
    attachments: parseAttachments(row.attachments),
    caption: row.caption,
    messageId: row.messageId,
    text: row.text,
    ...(row.mediaGroupId === null || row.mediaGroupId.length === 0 ? {} : { mediaGroupId: row.mediaGroupId }),
  };
}

function parseAttachments(value: unknown): TelegramBurstAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const attachments: TelegramBurstAttachment[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.fileId !== "string" || record.fileId.length === 0) {
      continue;
    }
    if (record.kind !== "document" && record.kind !== "photo") {
      continue;
    }
    attachments.push({
      fileId: record.fileId,
      kind: record.kind,
      ...(typeof record.fileName === "string" ? { fileName: record.fileName } : {}),
      ...(typeof record.fileUniqueId === "string" ? { fileUniqueId: record.fileUniqueId } : {}),
      ...(typeof record.height === "number" ? { height: record.height } : {}),
      ...(typeof record.mediaType === "string" ? { mediaType: record.mediaType } : {}),
      ...(typeof record.size === "number" ? { size: record.size } : {}),
      ...(typeof record.width === "number" ? { width: record.width } : {}),
    });
  }
  return attachments;
}

function burstItems() {
  const delegate = prisma["telegramInboundBurstItem"];
  if (delegate === undefined) {
    throw new Error("Prisma client is missing TelegramInboundBurstItem. Restart the eve runtime after prisma generate.");
  }
  return delegate;
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
