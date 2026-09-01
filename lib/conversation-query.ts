export const CONVERSATION_SEARCH_DEFAULT_LIMIT = 10;
export const CONVERSATION_SEARCH_MAX_LIMIT = 25;

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
