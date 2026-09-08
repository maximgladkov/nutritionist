import type { GoalRemaining, GoalsView } from "./goal-values.ts";
import type { NutrientValues } from "./nutrition.ts";

export type NutritionDayProgress = {
  current: NutrientValues;
  goals: GoalsView;
  remaining: GoalRemaining;
};

export function liveNutritionContextText(progress: NutritionDayProgress): string {
  const metrics = [
    formatMetric("calories", progress.current.energyKcal, progress.goals.caloriesPerDay, progress.remaining.energyKcal, "kcal"),
    formatMetric("protein", progress.current.proteins, progress.goals.proteinGPerDay, progress.remaining.proteins, "g"),
    formatMetric("carbs", progress.current.carbohydrates, progress.goals.carbsGPerDay, progress.remaining.carbohydrates, "g"),
    formatMetric("fat", progress.current.fat, progress.goals.fatGPerDay, progress.remaining.fat, "g"),
    formatMetric("fiber", progress.current.fiber, progress.goals.fiberGPerDay, progress.remaining.fiber, "g"),
  ];
  return [
    "Live database snapshot for this nutrition day (not from chat; the user can change meals and goals in the app):",
    `${metrics.join("; ")}.`,
    "After you log, add, copy, or delete food this turn, use goals, current, and remaining from that tool result instead of this snapshot.",
    "Never subtract leftover kcal from a previous assistant message.",
  ].join(" ");
}

export function isSingleDayQuery(from: string | undefined, to: string | undefined) {
  const start = from?.trim() ?? "";
  const end = to?.trim() ?? "";
  return start === "" || end === "" || start === end;
}

function formatMetric(
  name: string,
  current: number | null,
  goal: number | null,
  remaining: number | null,
  unit: "g" | "kcal",
) {
  const currentText = formatAmount(current);
  if (goal === null) {
    return `${name} current ${currentText} ${unit}, goal unset`;
  }
  return `${name} current ${currentText} / goal ${goal} ${unit} remaining ${formatAmount(remaining)}`;
}

function formatAmount(value: number | null) {
  return value === null ? "unknown" : String(value);
}
