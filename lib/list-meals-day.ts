import { inferMealLabel, MEAL_LABEL_HOURS, type InferredMealLabel } from "./meal-label.ts";
import { groupMealsByLabel, type MealGroupView } from "./meal-groups.ts";
import type { MealView } from "./meals.ts";
import { formatClock } from "./reminder-clock.ts";
import { DAY_START_HOUR, formatDateInTimeZone, getZonedParts, listLocalDates, shiftYmd } from "./timezone.ts";

// A meal as it's told to the agent: the time it was eaten where the person is. The moment itself would
// put a late-night snack on the next day.
export type ListedMeal = Omit<MealView, "eatenAt"> & { eatenAtLocal: string };

export type ListMealsDay = {
  date: string;
  // What the app calls it: "today", "yesterday" or the weekday.
  day: string;
  groups: MealGroupView[];
  meals: ListedMeal[];
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
  const today = formatDateInTimeZone(input.now, input.timeZone);
  return {
    currentLabel: inferMealLabel(input.now, input.timeZone),
    days: [...byDate.entries()].map(([date, meals]) => ({
      date,
      day: dayName(date, today),
      groups: groupMealsByLabel(meals),
      meals: meals.map(({ eatenAt, ...meal }) => ({ ...meal, eatenAtLocal: localTime(eatenAt, input.timeZone) })),
    })),
    from: input.from,
    labelHours: MEAL_LABEL_HOURS,
    to: input.to,
  };
}

export function dayName(date: string, today: string): string {
  if (date === today) return "today";
  if (date === shiftYmd(today, -1)) return "yesterday";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(new Date(`${date}T12:00:00Z`));
}

function localTime(eatenAt: string, timeZone: string): string {
  const { hour, minute } = getZonedParts(new Date(eatenAt), timeZone);
  return hour < DAY_START_HOUR ? `${formatClock(hour, minute)}, late that night` : formatClock(hour, minute);
}
