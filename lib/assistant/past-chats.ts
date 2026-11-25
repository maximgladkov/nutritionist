import { parseTranscript } from "../agent-turn-model.ts";
import { conversationTextWithoutMediaStubs } from "../conversation-query.ts";
import { prisma } from "../prisma.ts";
import { callerTimezone } from "../meals.ts";
import { formatDateInTimeZone } from "../timezone.ts";
import type { TalkPayload } from "./talk.ts";

const LOOKED_AT = 400;
export const PAST_CHATS_MAX = 12;
const TEXT_MAX = 400;

export type PastChat = { call?: true; coach: string; date: string; user: string };

// What they and the coach said in the app before, the newest first: every word of `query` in either
// side, or the latest without one.
export async function searchPastChats(input: { before?: string; query?: string; userId: string }): Promise<{ chats: PastChat[]; hasMore: boolean }> {
  const { before, userId } = input;
  const timeZone = (await callerTimezone(userId)) ?? "UTC";
  const [turns, talks] = await Promise.all([
    prisma.agentTurn.findMany({
      orderBy: { startedAt: "desc" },
      select: { messages: true, startedAt: true },
      take: LOOKED_AT,
      where: { channel: "app", status: "completed", userId },
    }),
    prisma.assistantAction.findMany({ orderBy: { createdAt: "desc" }, take: 60, where: { kind: "talk", userId } }),
  ]);
  const clip = (text: string) => conversationTextWithoutMediaStubs(text).replace(/\s+/gu, " ").slice(0, TEXT_MAX);
  const found = [
    ...turns.map((turn) => {
      const { items } = parseTranscript(turn.messages);
      const said = (type: "assistant" | "user") =>
        items.flatMap((item) => (item.type === type && !(item.type === "assistant" && item.finishReason === "tool-calls") ? [(item as { text: string }).text] : [])).join(" ");
      return { at: turn.startedAt, coach: said("assistant"), user: said("user") };
    }),
    ...talks.flatMap((row) => {
      const { lines } = row.payload as TalkPayload;
      if (!lines?.length) return [];
      const said = (speaker: "assistant" | "user") => lines.flatMap((line) => (line.speaker === speaker ? [line.text] : [])).join(" ");
      return [{ at: row.createdAt, call: true as const, coach: said("assistant"), user: said("user") }];
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const words = (input.query ?? "").toLowerCase().split(/\s+/u).filter((word) => word.length > 1);
  const matching = found
    .map((row) => ({ ...row, date: formatDateInTimeZone(row.at, timeZone) }))
    .filter((row) => (before ? row.date < before : true))
    .filter((row) => {
      const text = `${row.user} ${row.coach}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  return {
    chats: matching.slice(0, PAST_CHATS_MAX).map(({ at: _at, coach, user, ...rest }) => ({ ...rest, coach: clip(coach), user: clip(user) })),
    hasMore: matching.length > PAST_CHATS_MAX,
  };
}
