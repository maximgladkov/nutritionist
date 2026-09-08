import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  CONVERSATION_SEARCH_DEFAULT_LIMIT,
  CONVERSATION_SEARCH_MAX_LIMIT,
  searchConversation,
  TELEGRAM_CONVERSATION_CHANNEL,
} from "../../lib/conversation";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Search older Telegram chat with this caller. The current conversation is already in context. Pass a query for matching text, or omit it to list recent turns. Chat is not live meal, goal, current, or remaining data. Use list_meals for what they ate, and goals, current, and remaining from the live snapshot or from a meal/goal tool this turn.",
  inputSchema: z.object({
    query: z.string().optional(),
    limit: z.number().int().min(1).max(CONVERSATION_SEARCH_MAX_LIMIT).optional(),
  }),
  async execute({ query, limit }, ctx) {
    const { userId } = await requireUser(ctx);
    return searchConversation({
      channel: TELEGRAM_CONVERSATION_CHANNEL,
      limit: limit ?? CONVERSATION_SEARCH_DEFAULT_LIMIT,
      query,
      userId,
    });
  },
});
