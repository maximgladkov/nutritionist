import type { ToolContext } from "eve/tools";
import { recordLogged, type AssistantCard } from "../../lib/assistant/actions";
import type { MealView } from "../../lib/meals";

export function isAppCaller(session: ToolContext["session"]): boolean {
  return (session.auth.current ?? session.auth.initiator)?.attributes?.channel === "app";
}

// In the app, what was logged also becomes a card with Undo.
export async function withAppCard<T extends object>(
  ctx: ToolContext,
  userId: string,
  meal: MealView,
  addedItemIds: readonly string[],
  result: T,
): Promise<T & { card?: AssistantCard }> {
  if (!isAppCaller(ctx.session)) {
    return result;
  }
  const card = await recordLogged({ addedItemIds, callId: ctx.callId, meal, sessionId: ctx.session.id, userId });
  return card ? { ...result, card } : result;
}
