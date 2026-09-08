import { prisma } from "./prisma.ts";
import {
  clampConversationSearchLimit,
  conversationSearchCreatedAt,
  conversationSearchHasMore,
  conversationSearchQuery,
  CONVERSATION_SESSION_LOOKBACK,
  formatRecentConversation,
  TELEGRAM_CONVERSATION_CHANNEL,
} from "./conversation-query.ts";

export {
  CONVERSATION_SEARCH_DEFAULT_LIMIT,
  CONVERSATION_SEARCH_MAX_LIMIT,
  CONVERSATION_SESSION_GAP_MS,
  CONVERSATION_SESSION_LOOKBACK,
  RECENT_CONVERSATION_MAX_CHARS,
  ConversationError,
  clampConversationSearchLimit,
  conversationMessageText,
  conversationSearchCreatedAt,
  conversationSearchHasMore,
  conversationSearchQuery,
  conversationTextWithoutMediaStubs,
  formatRecentConversation,
  isTelegramConversationChannel,
  sliceCurrentConversation,
  TELEGRAM_CONVERSATION_CHANNEL,
} from "./conversation-query.ts";

export type ConversationRole = "assistant" | "user";

export type ConversationMessageView = {
  at: string;
  role: ConversationRole;
  text: string;
};

export async function recordConversationMessage(input: {
  channel: string;
  role: ConversationRole;
  sessionId: string;
  text: string;
  userId: string;
}): Promise<void> {
  const text = input.text.trim();
  if (text.length === 0) {
    return;
  }
  await prisma.conversationMessage.create({
    data: {
      channel: input.channel,
      role: input.role,
      sessionId: input.sessionId,
      text,
      userId: input.userId,
    },
  });
}

export async function persistTelegramConversationMessage(input: {
  role: ConversationRole;
  sessionId: string;
  text: string;
  userId: string | undefined;
}): Promise<void> {
  if (!input.userId) {
    return;
  }
  try {
    await recordConversationMessage({
      channel: TELEGRAM_CONVERSATION_CHANNEL,
      role: input.role,
      sessionId: input.sessionId,
      text: input.text,
      userId: input.userId,
    });
  } catch (error) {
    console.error("telegram conversation persist failed", error);
  }
}

export type ConversationSearchResult = {
  hasMore: boolean;
  messages: ConversationMessageView[];
};

export async function searchConversation(input: {
  after?: string;
  before?: string;
  channel: string;
  date?: string;
  limit?: number;
  query?: string;
  timeZone: string;
  userId: string;
}): Promise<ConversationSearchResult> {
  const query = conversationSearchQuery(input.query);
  const createdAt = conversationSearchCreatedAt({
    after: input.after,
    before: input.before,
    date: input.date,
    timeZone: input.timeZone,
  });
  const limit = clampConversationSearchLimit(input.limit);
  const rows = await prisma.conversationMessage.findMany({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, role: true, text: true },
    take: limit,
    where: {
      channel: input.channel,
      userId: input.userId,
      ...(createdAt === undefined ? {} : { createdAt }),
      ...(query === undefined ? {} : { text: { contains: query, mode: "insensitive" as const } }),
    },
  });
  return {
    hasMore: conversationSearchHasMore(rows.length, limit),
    messages: rows
      .map((row) => ({
        at: row.createdAt.toISOString(),
        role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
        text: row.text,
      }))
      .reverse(),
  };
}

export async function loadRecentConversation(input: {
  channel: string;
  userId: string;
}): Promise<string | undefined> {
  const rows = await prisma.conversationMessage.findMany({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, role: true, text: true },
    take: CONVERSATION_SESSION_LOOKBACK,
    where: {
      channel: input.channel,
      userId: input.userId,
    },
  });
  return formatRecentConversation(
    rows
      .map((row) => ({
        at: row.createdAt,
        role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
        text: row.text,
      }))
      .reverse(),
  );
}
