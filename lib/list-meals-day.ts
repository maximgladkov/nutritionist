import { inferMealLabel, MEAL_LABEL_HOURS, type InferredMealLabel } from "./meal-label.ts";
import { groupMealsByLabel, type MealGroupView } from "./meal-groups.ts";
import type { MealView } from "./meals.ts";
import { formatDateInTimeZone, listLocalDates } from "./timezone.ts";

export type ListMealsDay = {
  date: string;
  groups: MealGroupView[];
  meals: MealView[];
};

export type ListMealsDayPayload = {
  currentLabel: InferredMealLabel;
  days: ListMealsDay[];
  from: string;
  labelHours: typeof MEAL_LABEL_HOURS;
  to: string;
};

export function toListMealsDayPayload(input: {
  from: string;
  meals: readonly MealView[];
  now: Date;
  timeZone: string;
  to: string;
}): ListMealsDayPayload {
  const byDate = new Map<string, MealView[]>();
  for (const date of listLocalDates(new Date(input.from), new Date(input.to), input.timeZone)) {
    byDate.set(date, []);
  }
  for (const meal of input.meals) {
    const date = formatDateInTimeZone(new Date(meal.eatenAt), input.timeZone);
    const bucket = byDate.get(date) ?? [];
    bucket.push(meal);
    byDate.set(date, bucket);
  }
  return {
    currentLabel: inferMealLabel(input.now, input.timeZone),
    days: [...byDate.entries()].map(([date, meals]) => ({
      date,
      groups: groupMealsByLabel(meals),
      meals,
    })),
    from: input.from,
    labelHours: MEAL_LABEL_HOURS,
    to: input.to,
  };
}
