import { getGoals, remainingVsGoals, type GoalRemaining, type GoalsView } from "./goals.ts";
import { isSingleDayQuery, type NutritionDayProgress } from "./live-nutrition-context.ts";
import { callerTimezone, mealQueryRange, summarizeNutrition } from "./meals.ts";
import type { NutrientValues } from "./nutrition.ts";

export type { NutritionDayProgress } from "./live-nutrition-context.ts";
export { isSingleDayQuery, liveNutritionContextText } from "./live-nutrition-context.ts";

export type NutritionSummaryResult = Awaited<ReturnType<typeof summarizeNutrition>> & {
  current: NutrientValues;
  goals: GoalsView;
  remaining?: GoalRemaining;
};

export async function loadNutritionSummary(input: {
  userId: string;
  from?: string;
  to?: string;
  groupBy?: "day";
  timezone?: string;
  now?: Date;
}): Promise<NutritionSummaryResult> {
  const resolvedTimezone = await callerTimezone(input.userId, input.timezone);
  const range = mealQueryRange({
    from: input.from,
    to: input.to,
    now: input.now,
    timeZone: resolvedTimezone ?? "UTC",
  });
  const [summary, goals] = await Promise.all([
    summarizeNutrition({
      userId: input.userId,
      from: range.from,
      to: range.to,
      groupBy: input.groupBy,
      timezone: resolvedTimezone,
    }),
    getGoals(input.userId),
  ]);
  if (input.groupBy === "day" || !isSingleDayQuery(input.from, input.to)) {
    return { ...summary, current: summary.totals, goals };
  }
  return {
    ...summary,
    current: summary.totals,
    goals,
    remaining: remainingVsGoals(goals, summary.totals),
  };
}

export async function loadTodayNutritionProgress(
  userId: string,
  now?: Date,
): Promise<NutritionDayProgress> {
  const summary = await loadNutritionSummary({ now, userId });
  return {
    current: summary.current,
    goals: summary.goals,
    remaining: summary.remaining ?? remainingVsGoals(summary.goals, summary.current),
  };
}

export async function attachTodayNutritionProgress<T extends object>(
  userId: string,
  result: T,
  now?: Date,
): Promise<T & NutritionDayProgress> {
  const progress = await loadTodayNutritionProgress(userId, now);
  return { ...result, ...progress };
}
