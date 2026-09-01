import type { UserContent } from "ai";

export const CONVERSATION_SEARCH_DEFAULT_LIMIT = 10;
export const CONVERSATION_SEARCH_MAX_LIMIT = 25;
export const TELEGRAM_CONVERSATION_CHANNEL = "telegram";

export function clampConversationSearchLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) {
    return CONVERSATION_SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(CONVERSATION_SEARCH_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

export function conversationSearchQuery(query: string | undefined) {
  const normalized = query?.trim() ?? "";
  return normalized.length > 0 ? normalized : undefined;
}

export function isTelegramConversationChannel(kind: string | undefined) {
  return kind === TELEGRAM_CONVERSATION_CHANNEL || kind === `channel:${TELEGRAM_CONVERSATION_CHANNEL}`;
}

export function conversationMessageText(message: string | UserContent) {
  if (typeof message === "string") {
    return message.trim();
  }
  if (!Array.isArray(message)) {
    return "";
  }
  const parts: string[] = [];
  for (const part of message) {
    if (part.type === "text") {
      parts.push(part.text);
      continue;
    }
    if (part.type === "file") {
      const mediaType = part.mediaType;
      parts.push(`[file: ${part.filename ?? mediaType} (${mediaType})]`);
      continue;
    }
    if (part.type === "image") {
      parts.push(`[image: ${part.mediaType ?? "image"}]`);
    }
  }
  return parts.join("\n").trim();
}
