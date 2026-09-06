import { getZonedParts } from "./timezone.ts";

export type InferredMealLabel = "breakfast" | "lunch" | "dinner" | "snack";

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
