import type { UserContent } from "ai";

export const CONVERSATION_SEARCH_DEFAULT_LIMIT = 10;
export const CONVERSATION_SEARCH_MAX_LIMIT = 25;
export const CONVERSATION_SESSION_GAP_MS = 60 * 60 * 1000;
export const CONVERSATION_SESSION_LOOKBACK = 50;
export const RECENT_CONVERSATION_MAX_CHARS = 3500;
export const TELEGRAM_CONVERSATION_CHANNEL = "telegram";

const MEDIA_STUB = /\[(?:image|file): [^\]]*\]/gu;
export const RECENT_CONVERSATION_HEADER =
  "Current Telegram conversation for chat context only. Do not use calories, macros, remaining, or goals from these lines; those numbers are stale and the user can change them in the app. Use the live snapshot in context or goals, current, and remaining from a tool this turn. The current user message follows separately.";

export type ConversationContextMessage = {
  at?: Date | number | string;
  role: "assistant" | "user";
  text: string;
};

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

export function conversationTextWithoutMediaStubs(text: string) {
  return text.replace(MEDIA_STUB, "").replaceAll(/\n{2,}/gu, "\n").trim();
}

export function conversationMessageTime(value: Date | number | string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function sliceCurrentConversation<T extends { at?: Date | number | string }>(
  messages: readonly T[],
  options?: { gapMs?: number },
): T[] {
  const gapMs = options?.gapMs ?? CONVERSATION_SESSION_GAP_MS;
  if (messages.length === 0) {
    return [];
  }
  let start = 0;
  for (let index = messages.length - 1; index > 0; index -= 1) {
    const newer = conversationMessageTime(messages[index]?.at);
    const older = conversationMessageTime(messages[index - 1]?.at);
    if (newer === null || older === null) {
      continue;
    }
    if (newer - older >= gapMs) {
      start = index;
      break;
    }
  }
  return messages.slice(start);
}

export function formatRecentConversation(
  messages: readonly ConversationContextMessage[],
  options?: { gapMs?: number; maxChars?: number },
) {
  const maxChars = options?.maxChars ?? RECENT_CONVERSATION_MAX_CHARS;
  const lines: { role: "assistant" | "user"; text: string }[] = [];
  for (const message of sliceCurrentConversation(messages, { gapMs: options?.gapMs })) {
    const text = conversationTextWithoutMediaStubs(message.text);
    if (text.length === 0) {
      continue;
    }
    lines.push({ role: message.role, text });
  }
  if (lines.length === 0) {
    return undefined;
  }
  let items = lines;
  while (items.length > 0 && renderRecentConversation(items).length > maxChars) {
    if (items.length === 1) {
      const only = items[0];
      if (only === undefined) {
        return undefined;
      }
      const prefix = `${RECENT_CONVERSATION_HEADER}\n${recentConversationLabel(only.role)}: `;
      const budget = maxChars - prefix.length;
      if (budget <= 0) {
        return undefined;
      }
      return `${prefix}${only.text.slice(0, budget)}`;
    }
    items = items.slice(1);
  }
  const rendered = renderRecentConversation(items);
  return rendered.length > 0 ? rendered : undefined;
}

function recentConversationLabel(role: "assistant" | "user") {
  return role === "user" ? "User" : "Assistant";
}

function renderRecentConversation(items: readonly { role: "assistant" | "user"; text: string }[]) {
  const body = items.map((item) => `${recentConversationLabel(item.role)}: ${item.text}`).join("\n");
  return `${RECENT_CONVERSATION_HEADER}\n${body}`;
}
