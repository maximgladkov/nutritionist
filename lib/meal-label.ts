import { getZonedParts } from "./timezone.ts";

export type InferredMealLabel = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_LABEL_HOURS = {
  breakfast: "05:00–11:00",
  lunch: "11:00–16:00",
  dinner: "16:00–21:00",
  snack: "before 05:00 or from 21:00",
} as const;

export function mealSlotContextText(label: InferredMealLabel): string {
  return `Current meal slot: ${label} (${MEAL_LABEL_HOURS[label]}). Breakfast ${MEAL_LABEL_HOURS.breakfast}, lunch ${MEAL_LABEL_HOURS.lunch}, dinner ${MEAL_LABEL_HOURS.dinner}, otherwise snack.`;
}

export function mealLabelFromHour(hour: number): InferredMealLabel {
  if (hour < 5 || hour >= 21) {
    return "snack";
  }
  if (hour < 11) {
    return "breakfast";
  }
  if (hour < 16) {
    return "lunch";
  }
  return "dinner";
}

export function inferMealLabel(now: Date, timeZone: string): InferredMealLabel {
  return mealLabelFromHour(getZonedParts(now, timeZone).hour);
}
