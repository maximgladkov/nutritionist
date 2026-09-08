import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  CONVERSATION_SEARCH_DEFAULT_LIMIT,
  CONVERSATION_SEARCH_MAX_LIMIT,
  searchConversation,
  TELEGRAM_CONVERSATION_CHANNEL,
} from "../../lib/conversation";
import { callerTimezone } from "../../lib/meals";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Search older Telegram chat with this caller. The current conversation is already in context. Call once per need. Pass a query for matching text, or omit it to list recent turns. before and after are optional. Pass them as an ISO timestamp from a previous at, or as YYYY-MM-DD; both are exclusive. For a range such as this week, pass both in one call; do not call once per day. If hasMore is true, page older with before set to the oldest at; do not keep raising limit. Chat is not live meal, goal, current, or remaining data. Use list_meals for what they ate, copy_meal to repeat a logged meal, and goals, current, and remaining from the live snapshot or from a meal/goal tool this turn.",
  inputSchema: z.object({
    query: z.string().optional(),
    before: z.string().optional(),
    after: z.string().optional(),
    limit: z.number().int().min(1).max(CONVERSATION_SEARCH_MAX_LIMIT).optional(),
  }),
  async execute({ query, before, after, limit }, ctx) {
    const { userId } = await requireUser(ctx);
    const timeZone = (await callerTimezone(userId)) ?? "UTC";
    return searchConversation({
      after,
      before,
      channel: TELEGRAM_CONVERSATION_CHANNEL,
      limit: limit ?? CONVERSATION_SEARCH_DEFAULT_LIMIT,
      query,
      timeZone,
      userId,
    });
  },
});
