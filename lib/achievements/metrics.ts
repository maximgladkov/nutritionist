import type { GoalsView } from "../goals.ts";
import { consecutiveRecordedDays } from "../meal-streak.ts";
import { prisma } from "../prisma.ts";
import { readSummaryContext } from "../summary.ts";
import { formatDateInTimeZone, shiftYmd } from "../timezone.ts";
import { TALK_MAX_SECONDS, type TalkPayload } from "../assistant/talk.ts";
import { ACHIEVEMENT_EVENTS, type AchievementEventKind } from "./events.ts";

// What a badge can be measured by. A new metric is a name here and its numbers in computeMetrics.
export type MetricName =
  | "assistant_calls"
  | "assistant_chats"
  | "assistant_ideas"
  | "assistant_minutes"
  | "assistant_openers"
  | "assistant_photos"
  | "assistant_voice_notes"
  | "burned_best"
  | "burned_days"
  | "calorie_days"
  | "foods_logged"
  | "groups_joined"
  | "logging_streak"
  | "meal_photos"
  | "protein_days"
  | "recipes_saved"
  | "steps_best"
  | "steps_days"
  | "weigh_ins"
  | "weight_gained_kg"
  | "weight_lost_kg"
  | `event:${AchievementEventKind}`;

export type Metric = {
  // Where the person stands now.
  value: number;
  // What the metric stood at on each day it changed, oldest first. A badge is earned on the first
  // day that reached its target, so badges for things done long ago get their real date.
  history: readonly { date: string; value: number }[];
};

export type Metrics = Record<MetricName, Metric>;

// The facts badge texts and targets are written from.
export type AchievementContext = {
  goalWeightKg: number | null;
  goals: GoalsView;
  loggedDates: ReadonlySet<string>;
  startWeightKg: number | null;
  today: string;
};

export function earnedDate(metric: Metric, target: number): string | null {
  return metric.history.find((point) => point.value >= target)?.date ?? null;
}

// One more on each date.
function counting(dates: readonly string[]): Metric {
  const history = [...dates].sort().map((date, index) => ({ date, value: index + 1 }));
  return { history, value: dates.length };
}

function running(points: readonly { amount: number; date: string }[]): Metric {
  let value = 0;
  const history = points.map((point) => {
    value += point.amount;
    return { date: point.date, value };
  });
  return { history, value };
}

function streakMetric(dates: ReadonlySet<string>, today: string): Metric {
  let previous = "";
  let run = 0;
  const history = [...dates].sort().map((date) => {
    run = previous !== "" && shiftYmd(previous, 1) === date ? run + 1 : 1;
    previous = date;
    return { date, value: run };
  });
  return { history, value: consecutiveRecordedDays(dates, today) };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function weightMetric(entries: readonly { date: string; weightKg: number }[], startKg: number | null, sign: 1 | -1): Metric {
  if (startKg === null) {
    return { history: [], value: 0 };
  }
  const history = entries.map((entry) => ({
    date: entry.date,
    value: Math.max(0, round1((entry.weightKg - startKg) * sign)),
  }));
  return { history, value: history.at(-1)?.value ?? 0 };
}

// The most in any one day.
function best(points: readonly { amount: number; date: string }[]): Metric {
  let value = 0;
  const history = points.map((point) => {
    value = Math.max(value, Math.round(point.amount));
    return { date: point.date, value };
  });
  return { history, value };
}

// A day like this counts towards the badges for doing it often.
export const STEPS_DAY = 10_000;
export const BURNED_DAY_KCAL = 500;
// The longest one reply counts for.
const REPLY_MAX_MS = 120_000;

type TurnRow = { durationMs: number | null; photo: boolean; startedAt: Date };

async function assistantMetrics(userId: string, localDate: (at: Date) => string) {
  const [turns, actions, recipes] = await Promise.all([
    prisma.$queryRaw<TurnRow[]>`
      SELECT "startedAt", "durationMs", messages::text LIKE '%https://btr.me/api/v1/uploads/%' AS photo
      FROM "AgentTurn"
      WHERE "userId" = ${userId} AND channel = 'app' AND status = 'completed'
      ORDER BY "startedAt"`,
    prisma.assistantAction.findMany({
      orderBy: { createdAt: "asc" },
      where: { kind: { in: ["home", "idea", "talk", "voice"] }, userId },
    }),
    prisma.recipe.findMany({ select: { createdAt: true }, where: { userId } }),
  ]);
  const calls = actions.flatMap((row) => {
    const { endedAt, lines } = row.payload as TalkPayload;
    return row.kind === "talk" && endedAt && lines && lines.length > 0
      ? [{ date: localDate(row.createdAt), from: row.createdAt.getTime(), to: Math.min(Date.parse(endedAt), row.createdAt.getTime() + TALK_MAX_SECONDS * 1000) }]
      : [];
  });
  // What answered a call is part of it.
  const chats = turns.filter((turn) => !calls.some((call) => turn.startedAt.getTime() >= call.from && turn.startedAt.getTime() <= call.to));
  const notes = actions.filter((row) => row.kind === "voice");
  const spent = [
    ...calls.map((call) => ({ amount: Math.max(0, call.to - call.from), date: call.date })),
    ...chats.map((turn) => ({ amount: Math.min(REPLY_MAX_MS, turn.durationMs ?? 0), date: localDate(turn.startedAt) })),
    ...notes.map((row) => ({ amount: (row.payload as { durationMs?: number }).durationMs ?? 0, date: localDate(row.createdAt) })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const minutes = running(spent.map(({ amount, date }) => ({ amount: amount / 60_000, date })));
  const dates = (rows: readonly { createdAt: Date }[]) => counting(rows.map((row) => localDate(row.createdAt)));
  return {
    assistant_calls: counting(calls.map((call) => call.date)),
    assistant_chats: counting(chats.map((turn) => localDate(turn.startedAt))),
    assistant_ideas: dates(actions.filter((row) => row.kind === "idea" && row.state === "added")),
    assistant_minutes: { history: minutes.history, value: Math.floor(minutes.value) },
    assistant_openers: dates(actions.filter((row) => row.kind === "home" && row.state === "opened")),
    assistant_photos: counting(chats.filter((turn) => turn.photo).map((turn) => localDate(turn.startedAt))),
    assistant_voice_notes: dates(notes),
    recipes_saved: dates(recipes),
  };
}

const CALORIE_TOLERANCE = 0.1;

type DayRow = { date: string; items: number; kcal: number | null; protein: number | null };

export async function computeMetrics(userId: string): Promise<{ context: AchievementContext; metrics: Metrics }> {
  const { goals, timezone, today } = await readSummaryContext(userId);
  const localDate = (at: Date) => formatDateInTimeZone(at, timezone);
  const [allDays, weights, profile, memberships, firstPhoto, events, activity, assistant] = await Promise.all([
    // Every day with a meal, with the day's totals (a whole diary as one row a day).
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char((m."eatenAt" AT TIME ZONE ${timezone})::date, 'YYYY-MM-DD') AS date,
             count(i.id)::int AS items,
             sum(i."energyKcal")::float8 AS kcal,
             sum(i.proteins)::float8 AS protein
      FROM "Meal" m
      LEFT JOIN "MealItem" i ON i."mealId" = m.id
      WHERE m."userId" = ${userId}
      GROUP BY 1
      ORDER BY 1`,
    prisma.weightEntry.findMany({ orderBy: { date: "asc" }, select: { date: true, weightKg: true }, where: { userId } }),
    prisma.userProfile.findUnique({ select: { goalWeightKg: true, startWeightKg: true }, where: { userId } }),
    prisma.groupMember.findMany({ select: { joinedAt: true }, where: { role: "member", userId } }),
    prisma.mealPhoto.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true }, where: { meal: { userId } } }),
    prisma.achievementEvent.findMany({ select: { createdAt: true, kind: true }, where: { userId } }),
    prisma.dailyActivity.findMany({ orderBy: { date: "asc" }, where: { date: { lte: today }, userId } }),
    assistantMetrics(userId, localDate),
  ]);
  const days = allDays.filter((day) => day.date <= today);
  const loggedDates = new Set(days.map((day) => day.date));
  const startWeightKg = profile?.startWeightKg ?? weights[0]?.weightKg ?? null;

  const proteinGoal = goals.proteinGPerDay;
  const kcalGoal = goals.caloriesPerDay;
  const proteinDays = proteinGoal ? days.filter((day) => (day.protein ?? 0) >= proteinGoal) : [];
  // Today can still go over, so only finished days count.
  const calorieDays = kcalGoal
    ? days.filter((day) => day.date < today && Math.abs((day.kcal ?? 0) - kcalGoal) <= kcalGoal * CALORIE_TOLERANCE)
    : [];

  const eventMetrics = Object.fromEntries(
    ACHIEVEMENT_EVENTS.map((kind) => [
      `event:${kind}`,
      counting(events.filter((event) => event.kind === kind).map((event) => localDate(event.createdAt))),
    ]),
  ) as Record<`event:${AchievementEventKind}`, Metric>;

  return {
    context: { goals, goalWeightKg: profile?.goalWeightKg ?? null, loggedDates, startWeightKg, today },
    metrics: {
      ...eventMetrics,
      ...assistant,
      burned_best: best(activity.map((day) => ({ amount: day.activeKcal ?? 0, date: day.date }))),
      burned_days: counting(activity.filter((day) => (day.activeKcal ?? 0) >= BURNED_DAY_KCAL).map((day) => day.date)),
      calorie_days: counting(calorieDays.map((day) => day.date)),
      foods_logged: running(days.map((day) => ({ amount: day.items, date: day.date }))),
      groups_joined: counting(memberships.map((membership) => localDate(membership.joinedAt))),
      logging_streak: streakMetric(loggedDates, today),
      meal_photos: counting(firstPhoto ? [localDate(firstPhoto.createdAt)] : []),
      protein_days: counting(proteinDays.map((day) => day.date)),
      steps_best: best(activity.map((day) => ({ amount: day.steps ?? 0, date: day.date }))),
      steps_days: counting(activity.filter((day) => (day.steps ?? 0) >= STEPS_DAY).map((day) => day.date)),
      weigh_ins: counting(weights.map((entry) => entry.date)),
      weight_gained_kg: weightMetric(weights, startWeightKg, 1),
      weight_lost_kg: weightMetric(weights, startWeightKg, -1),
    },
  };
}
