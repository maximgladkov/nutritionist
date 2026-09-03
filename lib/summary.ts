import { getGoals, type GoalsView } from "./goals.ts";
import { listMeals, summarizeNutrition, type MealView, type NutritionSummary } from "./meals.ts";
import { emptyNutrients, type NutrientKey, type NutrientValues } from "./nutrition.ts";
import { prisma } from "./prisma.ts";
import { NUTRITION_DAYS_INITIAL, NUTRITION_DAYS_MAX } from "./summary-days.ts";
import { formatDateInTimeZone, localInclusiveDateRange, listLocalDates, normalizeTimezone, shiftYmd } from "./timezone.ts";

export { CUSTOM_RANGE_MAX_DAYS, isSummaryPeriod, SUMMARY_PERIODS, type SummaryPeriod } from "./summary-range.ts";
export {
  NUTRITION_DAYS_INITIAL,
  NUTRITION_DAYS_MAX,
  NUTRITION_DAY_TODAY_INDEX,
  dayIndexWindows,
  ymdForDayIndex,
  ymdToDayIndex,
} from "./summary-days.ts";

export type NutritionDayBucket = {
  date: string;
  incomplete: NutrientKey[];
  itemCount: number;
  mealCount: number;
  totals: NutrientValues;
};

export type NutritionDaysPayload = {
  days: NutritionDayBucket[];
  from: string;
  goals: GoalsView;
  to: string;
  today: string;
  timezone: string;
  timezoneIsFallback: boolean;
};

export type NutritionDayPayload = {
  date: string;
  goals: GoalsView;
  incomplete: NutrientKey[];
  itemCount: number;
  mealCount: number;
  meals: MealView[];
  timezone: string;
  timezoneIsFallback: boolean;
  today: string;
  totals: NutrientValues;
};

export type NutritionDiaryPayload = {
  day: NutritionDayPayload;
  days: NutritionDaysPayload;
};

type SummaryContext = {
  goals: GoalsView;
  now: Date;
  timezone: string;
  timezoneIsFallback: boolean;
  today: string;
  userId: string;
};

export async function loadNutritionDays(input: {
  from: string;
  now?: Date;
  to: string;
  userId: string;
}): Promise<NutritionDaysPayload> {
  const ctx = await readSummaryContext(input.userId, input.now);
  return loadDaysForContext(ctx, input.from, input.to);
}

export async function loadNutritionDay(input: {
  date: string;
  now?: Date;
  userId: string;
}): Promise<NutritionDayPayload> {
  const ctx = await readSummaryContext(input.userId, input.now);
  return loadDayForContext(ctx, input.date);
}

export async function loadNutritionDiary(input: {
  now?: Date;
  userId: string;
}): Promise<NutritionDiaryPayload> {
  const ctx = await readSummaryContext(input.userId, input.now);
  const from = shiftYmd(ctx.today, -(NUTRITION_DAYS_INITIAL - 1));
  const [days, day] = await Promise.all([
    loadDaysForContext(ctx, from, ctx.today),
    loadDayForContext(ctx, ctx.today),
  ]);
  return { day, days };
}

export async function loadTodayNutritionDay(input: {
  now?: Date;
  userId: string;
}): Promise<NutritionDayPayload> {
  const ctx = await readSummaryContext(input.userId, input.now);
  return loadDayForContext(ctx, ctx.today);
}

async function readSummaryContext(userId: string, now = new Date()): Promise<SummaryContext> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  const normalized = profile?.timezone ? normalizeTimezone(profile.timezone) : null;
  const timezone = normalized ?? "UTC";
  return {
    goals: await getGoals(userId),
    now,
    timezone,
    timezoneIsFallback: normalized === null,
    today: formatDateInTimeZone(now, timezone),
    userId,
  };
}

async function loadDaysForContext(
  ctx: SummaryContext,
  from: string,
  to: string,
): Promise<NutritionDaysPayload> {
  const clampedTo = to > ctx.today ? ctx.today : to;
  if (from > clampedTo) {
    throw new RangeError("from must be on or before to");
  }
  const range = localInclusiveDateRange(ctx.timezone, from, clampedTo, NUTRITION_DAYS_MAX);
  const summary = withFilledDays(
    await summarizeNutrition({
      from: range.from,
      groupBy: "day",
      timezone: ctx.timezone,
      to: range.to,
      userId: ctx.userId,
    }),
    ctx.timezone,
  );
  return {
    days: summary.days ?? [],
    from,
    goals: ctx.goals,
    to: clampedTo,
    today: ctx.today,
    timezone: ctx.timezone,
    timezoneIsFallback: ctx.timezoneIsFallback,
  };
}

async function loadDayForContext(ctx: SummaryContext, date: string): Promise<NutritionDayPayload> {
  if (date > ctx.today) {
    throw new RangeError("date cannot be in the future");
  }
  const range = localInclusiveDateRange(ctx.timezone, date, date, 1);
  const [summary, listed] = await Promise.all([
    summarizeNutrition({
      from: range.from,
      timezone: ctx.timezone,
      to: range.to,
      userId: ctx.userId,
    }),
    listMeals({ from: range.from, to: range.to, userId: ctx.userId }),
  ]);
  return {
    date,
    goals: ctx.goals,
    incomplete: summary.incomplete,
    itemCount: summary.itemCount,
    mealCount: summary.mealCount,
    meals: listed.meals,
    timezone: ctx.timezone,
    timezoneIsFallback: ctx.timezoneIsFallback,
    today: ctx.today,
    totals: summary.totals,
  };
}

function withFilledDays(summary: NutritionSummary, timeZone: string): NutritionSummary {
  const byDate = new Map((summary.days ?? []).map((day) => [day.date, day]));
  return {
    ...summary,
    days: listLocalDates(new Date(summary.from), new Date(summary.to), timeZone).map((date) => {
      return (
        byDate.get(date) ?? {
          date,
          incomplete: [],
          itemCount: 0,
          mealCount: 0,
          totals: emptyNutrients(),
        }
      );
    }),
  };
}
