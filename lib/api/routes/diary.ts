import { z } from "zod";
import { listMeals, type MealView } from "../../meals.ts";
import type { MealLabel } from "../../../generated/prisma/client.ts";
import { prisma } from "../../prisma.ts";
import {
  loadNutritionDay,
  loadNutritionDays,
  loadTodayNutritionDay,
  readSummaryContext,
  type NutritionDayBucket,
  type SummaryContext,
} from "../../summary.ts";
import { NUTRITION_DAYS_MAX } from "../../summary-days.ts";
import { consecutiveRecordedDays } from "../../meal-streak.ts";
import { emptyNutrients } from "../../nutrition.ts";
import { formatDateInTimeZone, localInclusiveDateRange, parseYmd, shiftYmd } from "../../timezone.ts";
import { invalid } from "../errors.ts";
import { readQuery } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { remainingAgainstGoals, withMealPhotos } from "../views.ts";

const MEAL_LABELS: readonly MealLabel[] = ["breakfast", "lunch", "dinner", "snack", "other"];
export const MAX_RANGE_DAYS = 92;

const ymd = z.string().refine((value) => parseYmd(value) !== null, "Use a YYYY-MM-DD date.");

export type DayActivity = { activeKcal: number | null; steps: number | null };

export type DayBucketView = NutritionDayBucket & {
  // Active calories burned that day (Apple Health); null when not shared.
  activeKcal: number | null;
  byLabel: Record<MealLabel, number>;
  future: boolean;
  logged: boolean;
};

function emptyByLabel(): Record<MealLabel, number> {
  return { breakfast: 0, dinner: 0, lunch: 0, other: 0, snack: 0 };
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftYmd(date, -((weekday + 6) % 7));
}

// Day buckets for [from, to], including per-meal calories for stacked charts. Days after
// today come back empty with `future: true` so a week view always has seven entries.
export async function loadDayBuckets(userId: string, from: string, to: string): Promise<{
  days: DayBucketView[];
  goals: SummaryContext["goals"];
  timezone: string;
  today: string;
}> {
  if (from > to) {
    throw invalid("from must be on or before to.");
  }
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    throw invalid(`Ask for at most ${MAX_RANGE_DAYS} days at a time.`);
  }
  const { goals, timezone, today } = await readSummaryContext(userId);

  const buckets = new Map<string, NutritionDayBucket>();
  const lastPast = to > today ? today : to;
  for (let start = from; start <= lastPast; start = shiftYmd(start, NUTRITION_DAYS_MAX)) {
    const end = shiftYmd(start, NUTRITION_DAYS_MAX - 1);
    const window = await loadNutritionDays({ from: start, to: end > lastPast ? lastPast : end, userId });
    for (const day of window.days) {
      buckets.set(day.date, day);
    }
  }

  const byLabel = new Map<string, Record<MealLabel, number>>();
  if (from <= lastPast) {
    const range = localInclusiveDateRange(timezone, from, lastPast, MAX_RANGE_DAYS);
    const { meals } = await listMeals({ from: range.from, to: range.to, userId });
    for (const meal of meals) {
      const date = formatDateInTimeZone(new Date(meal.eatenAt), timezone);
      const labels = byLabel.get(date) ?? emptyByLabel();
      labels[meal.label] += Math.round(meal.totals.energyKcal ?? 0);
      byLabel.set(date, labels);
    }
  }

  const activityRows = await prisma.dailyActivity.findMany({
    select: { activeKcal: true, date: true },
    where: { date: { gte: from, lte: to }, userId },
  });
  const activeByDate = new Map(activityRows.map((row) => [row.date, row.activeKcal]));

  const days: DayBucketView[] = [];
  for (let date = from; date <= to; date = shiftYmd(date, 1)) {
    const bucket = buckets.get(date) ?? {
      date,
      incomplete: [],
      itemCount: 0,
      mealCount: 0,
      totals: emptyNutrients(),
    };
    days.push({
      ...bucket,
      activeKcal: activeByDate.get(date) ?? null,
      byLabel: byLabel.get(date) ?? emptyByLabel(),
      future: date > today,
      logged: bucket.itemCount > 0,
    });
  }
  return { days, goals, timezone, today };
}

async function loadStreak(userId: string, timezone: string, today: string): Promise<number> {
  const meals = await prisma.meal.findMany({ select: { eatenAt: true }, where: { userId } });
  return consecutiveRecordedDays(new Set(meals.map((meal) => formatDateInTimeZone(meal.eatenAt, timezone))), today);
}

export async function loadDayActivity(userId: string, date: string): Promise<DayActivity | null> {
  const row = await prisma.dailyActivity.findUnique({ where: { userId_date: { date, userId } } });
  return row ? { activeKcal: row.activeKcal, steps: row.steps } : null;
}

export async function loadDayView(userId: string, date?: string) {
  const day = date ? await loadNutritionDay({ date, userId }) : await loadTodayNutritionDay({ userId });
  const [meals, activity] = await Promise.all([withMealPhotos(sortMeals(day.meals)), loadDayActivity(userId, day.date)]);
  return {
    ...day,
    // Active calories and steps from Apple Health; null until the phone has shared any.
    activity,
    meals,
    remaining: remainingAgainstGoals(day.totals, day.goals),
  };
}

function sortMeals(meals: MealView[]): MealView[] {
  return [...meals].sort(
    (a, b) => MEAL_LABELS.indexOf(a.label) - MEAL_LABELS.indexOf(b.label) || a.eatenAt.localeCompare(b.eatenAt),
  );
}

export const diaryRoutes: RouteDefinition[] = [
  {
    async handler({ url, user }) {
      const query = readQuery(url, z.object({ date: ymd.optional() }));
      const day = await loadDayView(user.id, query.date);
      const monday = mondayOf(day.date);
      const [week, streak] = await Promise.all([
        loadDayBuckets(user.id, monday, shiftYmd(monday, 6)),
        loadStreak(user.id, day.timezone, day.today),
      ]);
      return {
        day,
        goals: day.goals,
        streak,
        timezone: day.timezone,
        timezoneIsFallback: day.timezoneIsFallback,
        today: day.today,
        week: week.days,
      };
    },
    method: "GET",
    path: "/diary",
  },
  {
    async handler({ params, user }) {
      if (!parseYmd(params.date ?? "")) {
        throw invalid("Use a YYYY-MM-DD date.");
      }
      return loadDayView(user.id, params.date);
    },
    method: "GET",
    path: "/diary/days/:date",
  },
  {
    async handler({ url, user }) {
      const query = readQuery(url, z.object({ from: ymd, to: ymd }));
      return loadDayBuckets(user.id, query.from, query.to);
    },
    method: "GET",
    path: "/diary/days",
  },
];
