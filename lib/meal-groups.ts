import type { MealLabel } from "../generated/prisma/client";
import type { MealItemView, MealView } from "./meals.ts";
import { incompleteNutrients, sumNutrients, type NutrientKey, type NutrientValues } from "./nutrition.ts";

export const MEAL_GROUP_ORDER = ["breakfast", "lunch", "dinner", "snack", "other"] as const;

export type MealGroupView = {
  incomplete: NutrientKey[];
  items: MealItemView[];
  label: MealLabel;
  totals: NutrientValues;
};

export function groupMealsByLabel(meals: readonly MealView[]): MealGroupView[] {
  const buckets = new Map<MealLabel, MealView[]>();
  for (const meal of meals) {
    const group = buckets.get(meal.label) ?? [];
    group.push(meal);
    buckets.set(meal.label, group);
  }
  return MEAL_GROUP_ORDER.flatMap((label) => {
    const group = buckets.get(label);
    if (!group || group.length === 0) {
      return [];
    }
    const items = group.flatMap((meal) => meal.items);
    if (items.length === 0) {
      return [];
    }
    const metrics = items.map((item) => item.metrics);
    return [
      {
        incomplete: incompleteNutrients(metrics),
        items,
        label,
        totals: sumNutrients(metrics),
      },
    ];
  });
}
