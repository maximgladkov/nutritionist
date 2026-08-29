import { getGoals, type GoalsView } from "./goals.ts";
import { listMeals, summarizeNutrition, type MealView, type NutritionSummary } from "./meals.ts";
import { emptyNutrients } from "./nutrition.ts";
import { prisma } from "./prisma.ts";
import { resolveSummaryRange, type SummaryPeriod } from "./summary-range.ts";
import { listLocalDates, normalizeTimezone } from "./timezone.ts";

export { CUSTOM_RANGE_MAX_DAYS, isSummaryPeriod, SUMMARY_PERIODS, type SummaryPeriod } from "./summary-range.ts";

export type NutritionSummaryPayload = {
  customFrom: string | null;
  customTo: string | null;
  goals: GoalsView;
  meals: MealView[] | null;
  period: SummaryPeriod;
  summary: NutritionSummary;
  timezone: string;
  timezoneIsFallback: boolean;
};

export async function loadNutritionSummary(input: {
  customFrom?: string;
  customTo?: string;
  now?: Date;
  period: SummaryPeriod;
  userId: string;
}): Promise<NutritionSummaryPayload> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId: input.userId },
    select: { timezone: true },
  });
  const normalized = profile?.timezone ? normalizeTimezone(profile.timezone) : null;
  const timezone = normalized ?? "UTC";
  const now = input.now ?? new Date();
  const range = resolveSummaryRange({
    customFrom: input.customFrom,
    customTo: input.customTo,
    now,
    period: input.period,
    timeZone: timezone,
  });
  const summary = withFilledDays(
    await summarizeNutrition({
      from: range.from,
      groupBy: "day",
      timezone,
      to: range.to,
      userId: input.userId,
    }),
    timezone,
  );
  const meals =
    input.period === "today"
      ? (await listMeals({ from: range.from, to: range.to, userId: input.userId })).meals
      : null;
  const goals = await getGoals(input.userId);
  return {
    customFrom: input.customFrom ?? null,
    goals,
    customTo: input.customTo ?? null,
    meals,
    period: input.period,
    summary,
    timezone,
    timezoneIsFallback: normalized === null,
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
