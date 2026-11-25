import type { AssistantAction } from "../../generated/prisma/client.ts";
import { parseTranscript, type AgentTurnMessage } from "../agent-turn-model.ts";
import { prisma } from "../prisma.ts";
import { loadTodayNutritionProgress } from "../nutrition-progress.ts";
import { listMeals } from "../meals.ts";
import { readSummaryContext } from "../summary.ts";
import { getZonedParts, localDayRange } from "../timezone.ts";
import { cardView, type AssistantCard } from "./actions.ts";
import { DISPLAY_KINDS, displayView, type AssistantDisplay } from "./displays.ts";
import { openersBetween, type HomeOpener } from "./home-message.ts";
import { photosIn } from "./photos.ts";
import type { TalkLine, TalkPayload } from "./talk.ts";

export const CONVERSATION_PAGE = 30;
// eve retires a session after 30 days; start a fresh one before then.
const SESSION_MAX_AGE_MS = 25 * 24 * 60 * 60_000;
// Sessions begun on eve before 1.0 stay on the deployment that began them, which can't be talked to
// as the app does now.
const FIRST_SESSION_AT = new Date("2026-11-25T20:30:00Z");
// No call lasts longer than this.
const TALK_OVERLAP_MS = 15 * 60_000;
// A reply that hasn't finished by now never will.
const TURN_STALE_MS = 10 * 60_000;

// What each look-up is called in "Checked ...". Tools that only write aren't listed.
export const CHECKED_LABELS: Record<string, string> = {
  find_foods: "Food catalog",
  get_my_goals: "Goals",
  get_my_info: "Your details",
  get_my_profile: "Profile",
  get_nutrition_summary: "Nutrition",
  list_frequent_foods: "Foods you log often",
  list_meals: "Diary",
  lookup_product: "Food catalog",
  search_past_chats: "Past chats",
  search_products: "Food catalog",
};

export type AssistantVoice = { durationMs: number; levels: number[] };

export type AssistantOption = { description?: string; label: string; suggested?: boolean };

// What they can answer with, besides words of their own.
export type AssistantQuestion = { multiple: boolean; options: AssistantOption[] };

export type AssistantTurnView = {
  at: string;
  cards: AssistantCard[];
  checked: string[];
  displays: AssistantDisplay[];
  id: string;
  // What they attached. Show with the owner's token.
  photos: { id: string; url: string }[];
  // Waiting for their answer, which is whatever they send next; null otherwise.
  question: AssistantQuestion | null;
  reply: string;
  status: "cancelled" | "completed" | "failed" | "running";
  text: string;
  voice: AssistantVoice | null;
};

export type AssistantGreeting = {
  at: string;
  remaining: { energyKcal: number | null; proteins: number | null };
  text: string;
};

// A live spoken conversation. The agent's turns that answered it are in `turnIds`: show the call
// instead of them.
export type AssistantTalkView = {
  at: string;
  cards: AssistantCard[];
  displays: AssistantDisplay[];
  endedAt: string;
  id: string;
  lines: TalkLine[];
  turnIds: string[];
};

export type ConversationView = {
  greeting: AssistantGreeting | null;
  // Send as `before` for the turns before these; null at the beginning.
  next: string | null;
  // Home messages they tapped, oldest first: the coach's own lines. Older apps don't read these.
  openers: HomeOpener[];
  // The session to continue, or null to start one.
  sessionId: string | null;
  // Oldest first. Apps from before calls were saved don't read these.
  talks: AssistantTalkView[];
  // Oldest first.
  turns: AssistantTurnView[];
};

// The words meant for the person: what the model says just before using a tool is narration.
function replyText(items: readonly AgentTurnMessage[]): string {
  return items
    .flatMap((item) => {
      if (item.type === "assistant") return item.finishReason === "tool-calls" ? [] : [item.text];
      const asked = askedIn(item);
      return asked ? [asked.question] : [];
    })
    .join("\n\n");
}

// A question the coach put to them. Their answer belongs to the turn that asked.
function askedIn(item: AgentTurnMessage): (AssistantQuestion & { answer: string | null; question: string }) | null {
  if (item.type !== "tool" || item.toolName !== "ask_question") return null;
  if (item.isError) return null;
  const { multiple, options, question } = (item.input ?? {}) as { multiple?: boolean; options?: AssistantOption[]; question?: unknown };
  const answer = (item.output as { answer?: unknown } | undefined)?.answer;
  return typeof question === "string" ? { answer: typeof answer === "string" ? answer : null, multiple: multiple === true, options: options ?? [], question } : null;
}

// A turn that asked something goes on with their answer: shown as one exchange, and then another.
function exchangesIn(items: readonly AgentTurnMessage[]): AgentTurnMessage[][] {
  const exchanges: AgentTurnMessage[][] = [[]];
  let answer: string | null = null;
  for (const item of items) {
    if (answer) {
      exchanges.push([{ at: item.at, text: answer, type: "user" }]);
      answer = null;
    }
    exchanges.at(-1)!.push(item);
    answer = askedIn(item)?.answer ?? answer;
  }
  return exchanges;
}

// Nothing is left to wait for while the coach waits for them.
function waitsForAnswer(items: readonly AgentTurnMessage[]): boolean {
  return openQuestion(items) !== null;
}

function openQuestion(items: readonly AgentTurnMessage[]): AssistantQuestion | null {
  const item = items.findLast((each) => askedIn(each) !== null);
  const asked = item?.type === "tool" && item.output === undefined ? askedIn(item) : null;
  return asked && { multiple: asked.multiple, options: asked.options };
}

type VoicePayload = AssistantVoice & { text: string };

async function greetingFor(userId: string, now: Date): Promise<AssistantGreeting | null> {
  const { timezone, today } = await readSummaryContext(userId, now);
  const callId = `greeting:${today}`;
  const where = { userId_callId: { callId, userId } };
  const saved = await prisma.assistantAction.findUnique({ where });
  if (saved) {
    return { ...(saved.payload as Omit<AssistantGreeting, "at">), at: saved.createdAt.toISOString() };
  }
  const [progress, day] = await Promise.all([
    loadTodayNutritionProgress(userId, now),
    listMeals({ userId, ...localDayRange(now, timezone) }),
  ]);
  const hour = getZonedParts(now, timezone).hour;
  const hello = hour >= 4 && hour < 12 ? "Good morning!" : hour >= 12 && hour < 18 ? "Good afternoon!" : "Good evening!";
  const kcal = Math.round(progress.current.energyKcal ?? 0);
  const logged = day.meals.filter((meal) => meal.items.length > 0);
  const labels = new Set(logged.map((meal) => meal.label));
  const named = [...labels][0];
  const what =
    labels.size === 1 && named && named !== "other"
      ? `${named === "snack" ? "Your snack" : named[0]!.toUpperCase() + named.slice(1)} is logged: **${kcal.toLocaleString("en")} kcal**.`
      : `You've logged **${kcal.toLocaleString("en")} kcal** so far.`;
  const remaining = { energyKcal: progress.remaining.energyKcal, proteins: progress.remaining.proteins };
  const hasGoal = remaining.energyKcal !== null || remaining.proteins !== null;
  const text =
    logged.length === 0
      ? `${hello} Nothing logged yet today. Tell me what you ate, or ask me anything.`
      : hasGoal
        ? `${hello} ${what} Here's what's left for today.`
        : `${hello} ${what} Ask me anything.`;
  const payload = { remaining: logged.length > 0 ? remaining : { energyKcal: null, proteins: null }, text };
  const row = await prisma.assistantAction.upsert({
    create: { callId, createdAt: now, kind: "greeting", payload, userId },
    update: {},
    where,
  });
  return { ...(row.payload as Omit<AssistantGreeting, "at">), at: row.createdAt.toISOString() };
}

const MEAL_CARD_KINDS = ["idea", "logged"];
const CARD_KINDS = [...MEAL_CARD_KINDS, ...DISPLAY_KINDS];

function cardsOf(rows: readonly AssistantAction[]): AssistantCard[] {
  return rows.filter((row) => MEAL_CARD_KINDS.includes(row.kind)).map(cardView);
}

function displaysOf(rows: readonly AssistantAction[]): AssistantDisplay[] {
  return rows.filter((row) => DISPLAY_KINDS.includes(row.kind)).map(displayView);
}

function talkIn(row: { payload: unknown }): { endedAt: Date; lines: TalkLine[] } | null {
  const { endedAt, lines } = row.payload as TalkPayload;
  return endedAt && lines && lines.length > 0 ? { endedAt: new Date(endedAt), lines } : null;
}

// The calls that started in a stretch of the conversation, with what the agent did during each.
async function talksBetween(userId: string, from: Date | null, before: Date | null): Promise<AssistantTalkView[]> {
  const rows = await prisma.assistantAction.findMany({
    orderBy: { createdAt: "desc" },
    take: CONVERSATION_PAGE,
    where: { createdAt: { ...(from ? { gte: from } : {}), ...(before ? { lt: before } : {}) }, kind: "talk", userId },
  });
  const talks = rows.flatMap((row) => {
    const talk = talkIn(row);
    return talk ? [{ ...talk, row }] : [];
  });
  return Promise.all(
    talks.reverse().map(async ({ endedAt, lines, row }) => {
      const turns = await prisma.agentTurn.findMany({
        orderBy: { startedAt: "asc" },
        where: { channel: "app", startedAt: { gte: row.createdAt, lte: endedAt }, userId },
      });
      const callIds = turns.flatMap((turn) =>
        parseTranscript(turn.messages).items.flatMap((item) => (item.type === "tool" ? [item.callId] : [])),
      );
      const actions = await prisma.assistantAction.findMany({
        orderBy: { createdAt: "asc" },
        where: { callId: { in: callIds }, kind: { in: CARD_KINDS }, userId },
      });
      return {
        at: row.createdAt.toISOString(),
        cards: cardsOf(actions),
        displays: displaysOf(actions),
        endedAt: endedAt.toISOString(),
        id: row.id,
        lines,
        turnIds: turns.map((turn) => `${turn.sessionId}:${turn.turnId}`),
      };
    }),
  );
}

export async function loadConversation(input: { before?: Date; now: Date; userId: string }): Promise<ConversationView> {
  const { before, now, userId } = input;
  const rows = await prisma.agentTurn.findMany({
    orderBy: [{ startedAt: "desc" }, { turnSequence: "desc" }],
    take: CONVERSATION_PAGE + 1,
    where: { channel: "app", userId, ...(before ? { startedAt: { lt: before } } : {}) },
  });
  const page = rows.slice(0, CONVERSATION_PAGE).reverse();
  const callIds: string[] = [];
  const transcripts = new Map(page.map((row) => [row.id, parseTranscript(row.messages).items]));
  for (const items of transcripts.values()) {
    for (const item of items) {
      if (item.type === "tool") callIds.push(item.callId);
    }
  }
  const sessionIds = [...new Set(page.map((row) => row.sessionId))];
  const [actions, voices, session] = await Promise.all([
    prisma.assistantAction.findMany({ where: { callId: { in: callIds }, kind: { in: CARD_KINDS }, userId } }),
    prisma.assistantAction.findMany({
      orderBy: { createdAt: "asc" },
      where: { kind: "voice", sessionId: { in: sessionIds }, userId },
    }),
    before
      ? null
      : prisma.agentSession.findFirst({
          orderBy: { createdAt: "desc" },
          where: { channel: "app", createdAt: { gt: new Date(Math.max(now.getTime() - SESSION_MAX_AGE_MS, FIRST_SESSION_AT.getTime())) }, userId },
        }),
  ]);
  const byCall = new Map(actions.map((row) => [row.callId, row]));
  // A voice note reaches the agent as its words, so the note is matched back by them, each once.
  const unmatched = [...voices];
  const takeVoice = (sessionId: string, text: string): AssistantVoice | null => {
    const index = unmatched.findIndex(
      (row) => row.sessionId === sessionId && (row.payload as VoicePayload).text === text,
    );
    if (index < 0) return null;
    const payload = unmatched.splice(index, 1)[0]!.payload as VoicePayload;
    return { durationMs: payload.durationMs, levels: payload.levels };
  };

  const turns = page.flatMap((row) => exchangesIn(transcripts.get(row.id) ?? []).map((items, index, all): AssistantTurnView => {
    const last = index === all.length - 1;
    const said = items.flatMap((item) => (item.type === "user" ? [item] : []));
    const photos = said.flatMap((item) => photosIn(item.parts));
    const text = said
      .map((item) =>
        photosIn(item.parts).length > 0
          ? item.parts!.flatMap((part) => (part.type === "text" && part.text ? [part.text] : [])).join("\n")
          : item.text,
      )
      .filter((words) => words.length > 0)
      .join("\n");
    const tools = items.flatMap((item) => (item.type === "tool" ? [item] : []));
    const stale = row.status === "running" && now.getTime() - row.startedAt.getTime() > TURN_STALE_MS;
    return {
      at: (index > 0 && items[0]?.at) || row.startedAt.toISOString(),
      cards: cardsOf(tools.flatMap((tool) => byCall.get(tool.callId) ?? [])),
      checked: [
        ...new Set(
          tools.flatMap((tool) => (tool.isError || !CHECKED_LABELS[tool.toolName] ? [] : [CHECKED_LABELS[tool.toolName]!])),
        ),
      ],
      displays: displaysOf(tools.flatMap((tool) => byCall.get(tool.callId) ?? [])),
      id: `${row.sessionId}:${row.turnId}${index > 0 ? `:${index}` : ""}`,
      photos,
      question: last && row.status === "running" ? openQuestion(items) : null,
      reply: replyText(items),
      status: !last || (row.status === "running" && waitsForAnswer(items)) ? "completed" : stale ? "failed" : row.status,
      text,
      voice: takeVoice(row.sessionId, text),
    };
  }));

  // A page reaches back to its oldest turn, or to the beginning when it's the last one. Calls reach a
  // little further, so one that began just before the page still covers its turns here.
  const more = rows.length > CONVERSATION_PAGE;
  const from = more ? page[0]!.startedAt : null;
  const reach = from && new Date(from.getTime() - TALK_OVERLAP_MS);
  const [talks, openers] = await Promise.all([
    talksBetween(userId, reach, before ?? null),
    openersBetween(userId, reach, before ?? null, CONVERSATION_PAGE),
  ]);

  return {
    greeting: before ? null : await greetingFor(userId, now),
    next: rows.length > CONVERSATION_PAGE ? page[0]!.startedAt.toISOString() : null,
    openers,
    sessionId: session?.eveSessionId ?? null,
    talks,
    turns,
  };
}
