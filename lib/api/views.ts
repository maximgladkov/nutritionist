import { NUTRIENT_KEYS, type NutrientValues } from "../nutrition.ts";
import { prisma } from "../prisma.ts";
import type { MealView } from "../meals.ts";
import type { GoalsView } from "../goal-values.ts";
import { API_PREFIX } from "./router.ts";

export type PhotoView = { id: string; url: string };

export function attachmentUrl(attachmentId: string): string {
  return `${API_PREFIX}/uploads/${encodeURIComponent(attachmentId)}/content`;
}

export type ApiMealView = MealView & { photos: PhotoView[] };

export async function withMealPhotos(meals: readonly MealView[]): Promise<ApiMealView[]> {
  if (meals.length === 0) {
    return [];
  }
  const photos = await prisma.mealPhoto.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { attachmentId: true, id: true, mealId: true },
    where: { mealId: { in: meals.map((meal) => meal.id) } },
  });
  const byMeal = new Map<string, PhotoView[]>();
  for (const photo of photos) {
    const list = byMeal.get(photo.mealId) ?? [];
    list.push({ id: photo.id, url: attachmentUrl(photo.attachmentId) });
    byMeal.set(photo.mealId, list);
  }
  return meals.map((meal) => ({ ...meal, photos: byMeal.get(meal.id) ?? [] }));
}

export async function mealWithPhotos(meal: MealView): Promise<ApiMealView> {
  const [withPhotos] = await withMealPhotos([meal]);
  return withPhotos as ApiMealView;
}

const GOAL_FOR_NUTRIENT: Partial<Record<keyof NutrientValues, keyof GoalsView>> = {
  carbohydrates: "carbsGPerDay",
  energyKcal: "caloriesPerDay",
  fat: "fatGPerDay",
  fiber: "fiberGPerDay",
  proteins: "proteinGPerDay",
};

// What is left against each daily goal. Null when the user has no goal for that nutrient.
export function remainingAgainstGoals(totals: NutrientValues, goals: GoalsView): Partial<Record<keyof NutrientValues, number | null>> {
  const remaining: Partial<Record<keyof NutrientValues, number | null>> = {};
  for (const key of NUTRIENT_KEYS) {
    const goalKey = GOAL_FOR_NUTRIENT[key];
    if (!goalKey) {
      continue;
    }
    const goal = goals[goalKey];
    remaining[key] = goal == null ? null : Math.round((goal - (totals[key] ?? 0)) * 10) / 10;
  }
  return remaining;
}
