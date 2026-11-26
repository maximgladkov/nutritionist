import { randomUUID } from "node:crypto";
import { parseTranscript } from "../agent-turn-model.ts";
import { loadPlan, PLANS, type CurrentPlan, type PlanId } from "../plans.ts";
import { prisma } from "../prisma.ts";
import { readSummaryContext } from "../summary.ts";
import { localWeekRange } from "../timezone.ts";
import { TALK_MAX_SECONDS, type TalkPayload } from "./talk.ts";

// How long someone may spend with the coach each week without paying, in minutes.
export const FREE_WEEKLY_MINUTES = PLANS.free.aiWeeklyMinutes ?? 30;
// What one message counts for: the time the coach worked on it, within reason.
const REPLY_MIN_S = 5;
const REPLY_MAX_S = 120;
// Less than this left isn't worth starting a call with.
export const TALK_MIN_LEFT_S = 15;

export type UsageSplit = { chat: number; scans: number; suggestions: number; talk: number; voice: number };

export type AssistantUsage = {
  asleep: boolean;
  // Seconds, all of it; null on plans without a weekly limit.
  limit: number | null;
  plan: PlanId;
  resetsAt: string;
  split: UsageSplit;
  // Seconds of live talk the plan allows each week; calls count towards `used` too.
  talkLimit: number;
  used: number;
};

export function weeklyLimitSeconds(plan?: CurrentPlan): number | null {
  if (plan && plan.limits.aiWeeklyMinutes === null) return null;
  const configured = Number(process.env.ASSISTANT_FREE_WEEKLY_MINUTES);
  return Math.round((Number.isFinite(configured) && configured > 0 ? configured : FREE_WEEKLY_MINUTES) * 60);
}

// Seconds left this week for the coach, and for live talk within that.
export function usageLeft(usage: AssistantUsage): { ai: number; talk: number } {
  const ai = usage.limit === null ? Number.POSITIVE_INFINITY : usage.limit - usage.used;
  return { ai, talk: Math.min(ai, usage.talkLimit - usage.split.talk) };
}

function replySeconds(durationMs: number): number {
  return Math.min(REPLY_MAX_S, Math.max(REPLY_MIN_S, Math.round(durationMs / 1000)));
}

// Time the AI spent on someone this week: chat replies, voice notes, calls, its messages on Today,
// and reading meal photos and nutrition labels. Barcodes and typed or spoken food aren't here.
export async function loadUsage(userId: string, now: Date): Promise<AssistantUsage> {
  const [{ timezone }, plan] = await Promise.all([readSummaryContext(userId, now), loadPlan(userId, now)]);
  const week = localWeekRange(now, timezone);
  const [turns, actions] = await Promise.all([
    prisma.agentTurn.findMany({
      orderBy: { startedAt: "asc" },
      select: { durationMs: true, messages: true, sessionId: true, startedAt: true, status: true },
      where: { channel: "app", startedAt: { gte: week.from, lt: week.to }, status: { not: "failed" }, userId },
    }),
    prisma.assistantAction.findMany({
      orderBy: { createdAt: "asc" },
      where: { createdAt: { gte: new Date(week.from.getTime() - TALK_MAX_SECONDS * 1000), lt: week.to }, kind: { in: ["home_run", "scan", "talk", "voice"] }, userId },
    }),
  ]);
  const split: UsageSplit = { chat: 0, scans: 0, suggestions: 0, talk: 0, voice: 0 };

  const calls: { from: number; to: number }[] = [];
  for (const row of actions) {
    if (row.kind !== "talk" || row.createdAt < week.from) continue;
    const { endedAt } = row.payload as TalkPayload;
    if (!endedAt) continue;
    const from = row.createdAt.getTime();
    // Written down a little after it ended, at most.
    const to = Math.min(Date.parse(endedAt), from + TALK_MAX_SECONDS * 1000);
    split.talk += Math.max(0, Math.round((to - from) / 1000));
    calls.push({ from, to });
  }

  // A voice note reaches the coach as its words, so it's matched to its message by them, each once.
  const notes = actions
    .filter((row) => row.kind === "voice" && row.createdAt >= week.from)
    .map((row) => ({ ...(row.payload as { durationMs: number; text: string }), sessionId: row.sessionId }));
  for (const turn of turns) {
    const at = turn.startedAt.getTime();
    // Already counted, as part of the call.
    if (calls.some((call) => at >= call.from && at <= call.to)) continue;
    const seconds = replySeconds(turn.durationMs ?? (turn.status === "running" ? now.getTime() - at : 0));
    const text = parseTranscript(turn.messages).items.flatMap((item) => (item.type === "user" ? [item.text] : [])).join("\n");
    const spoken = notes.findIndex((note) => note.sessionId === turn.sessionId && (note.text === text || text.startsWith(`${note.text}\n[`)));
    if (spoken < 0) {
      split.chat += seconds;
    } else {
      const [note] = notes.splice(spoken, 1);
      split.voice += seconds + Math.round((note?.durationMs ?? 0) / 1000);
    }
  }

  for (const row of actions) {
    if (row.createdAt < week.from) continue;
    const seconds = ((row.payload as { ms?: number }).ms ?? 0) / 1000;
    if (row.kind === "home_run") split.suggestions += seconds;
    if (row.kind === "scan") split.scans += seconds;
  }

  split.scans = Math.round(split.scans);
  split.suggestions = Math.round(split.suggestions);
  const used = split.chat + split.scans + split.suggestions + split.talk + split.voice;
  const limit = weeklyLimitSeconds(plan);
  return {
    asleep: limit !== null && used >= limit,
    limit,
    plan: plan.id,
    resetsAt: week.to.toISOString(),
    split,
    talkLimit: plan.limits.talkWeeklyMinutes * 60,
    used,
  };
}

export const ASLEEP_MESSAGE = "Your coach is asleep: you've used this week's free minutes. Come back next week for more, or upgrade.";

const SCAN_MAX_S = 60;

// Reading a meal photo or a label took this long. Only counted: logging food never stops working.
export async function recordScan(userId: string, source: "label" | "photo", ms: number, now: Date): Promise<void> {
  await prisma.assistantAction.create({
    data: {
      callId: `scan:${randomUUID()}`,
      createdAt: now,
      kind: "scan",
      payload: { ms: Math.min(SCAN_MAX_S * 1000, Math.round(ms)), source },
      userId,
    },
  });
}
