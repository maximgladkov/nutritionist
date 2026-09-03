import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { GoalField } from "@/lib/goal-values";
import type { MealView } from "@/lib/meals";
import type { ReminderLabel } from "@/lib/reminder-clock";

export const GOAL_LABELS: Record<GoalField, MessageDescriptor> = {
  caloriesPerDay: msg`Calories`,
  carbsGPerDay: msg`Carbs`,
  fatGPerDay: msg`Fat`,
  fiberGPerDay: msg`Fiber`,
  proteinGPerDay: msg`Protein`,
};

export const GOAL_UNIT_LABELS: Record<"g" | "kcal", MessageDescriptor> = {
  g: msg`grams per day`,
  kcal: msg`kilocalories per day`,
};

export const MEAL_LABELS: Record<MealView["label"], MessageDescriptor> = {
  breakfast: msg`Breakfast`,
  dinner: msg`Dinner`,
  lunch: msg`Lunch`,
  other: msg`Other`,
  snack: msg`Snack`,
};

export const REMINDER_TITLES: Record<ReminderLabel, MessageDescriptor> = {
  breakfast: msg`Breakfast`,
  dinner: msg`Dinner`,
  lunch: msg`Lunch`,
  summary: msg`Daily summary`,
};

