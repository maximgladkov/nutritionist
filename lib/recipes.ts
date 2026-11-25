import type { Prisma } from "../generated/prisma/client.ts";
import { previewMealItems, upsertMealItems, type MealItemInput, type MealView } from "./meals.ts";
import { computeItemNutrition, sumNutrients, type AmountUnit, type NutrientValues } from "./nutrition.ts";
import type { ProductNutriments } from "./open-food-facts.ts";
import { prisma } from "./prisma.ts";

export type RecipeIngredient = {
  amount: number;
  barcode: string | null;
  brand: string | null;
  metrics: NutrientValues | null;
  name: string;
  nutrimentsPer100g: ProductNutriments;
  unit: AmountUnit;
};

export type RecipeContent = {
  description: string | null;
  items: RecipeIngredient[];
  minutes: number | null;
  name: string;
  // Of one serving.
  perServing: NutrientValues;
  servings: number;
  steps: string[];
};

export type RecipeView = RecipeContent & { createdAt: string; id: string; updatedAt: string };

type RecipeRow = Prisma.RecipeGetPayload<{ include: { items: true } }>;

const include = { items: { orderBy: { sortOrder: "asc" } } } as const;

function divide(totals: NutrientValues, servings: number): NutrientValues {
  return Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, value === null ? null : Math.round((value / servings) * 10) / 10]),
  ) as NutrientValues;
}

function perServing(items: readonly RecipeIngredient[], servings: number): NutrientValues {
  return divide(sumNutrients(items.flatMap((item) => (item.metrics ? [item.metrics] : []))), servings);
}

// Looks the ingredients up and works out the nutrition, without saving anything.
export async function composeRecipe(input: {
  country?: string;
  description?: string | null;
  items: MealItemInput[];
  minutes?: number | null;
  name: string;
  servings: number;
  signal?: AbortSignal;
  steps: string[];
}): Promise<RecipeContent> {
  const resolved = await previewMealItems({ country: input.country, items: input.items, signal: input.signal });
  const items = resolved.map(
    (item): RecipeIngredient => ({
      amount: item.amount,
      barcode: item.barcode,
      brand: item.brand,
      metrics: item.metrics,
      name: item.name,
      nutrimentsPer100g: item.nutriments,
      unit: item.unit,
    }),
  );
  return {
    description: input.description?.trim() || null,
    items,
    minutes: input.minutes ?? null,
    name: input.name.trim(),
    perServing: perServing(items, input.servings),
    servings: input.servings,
    steps: input.steps.map((step) => step.trim()).filter(Boolean),
  };
}

function toRecipeView(row: RecipeRow): RecipeView {
  const items = row.items.map((item): RecipeIngredient => {
    const nutriments = (item.nutrimentsPer100g ?? {}) as ProductNutriments;
    let metrics: NutrientValues | null = null;
    try {
      metrics = computeItemNutrition({ amount: item.amount, nutriments, unit: item.unit }).metrics;
    } catch {
      // A serving whose size isn't known: the ingredient is listed without numbers.
    }
    return { amount: item.amount, barcode: item.barcode, brand: item.brand, metrics, name: item.name, nutrimentsPer100g: nutriments, unit: item.unit };
  });
  return {
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    id: row.id,
    items,
    minutes: row.minutes,
    name: row.name,
    perServing: perServing(items, row.servings),
    servings: row.servings,
    steps: row.steps,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createRecipe(userId: string, content: RecipeContent): Promise<RecipeView> {
  return toRecipeView(
    await prisma.recipe.create({
      data: {
        description: content.description,
        items: {
          create: content.items.map(({ metrics: _metrics, ...item }, sortOrder) => ({
            ...item,
            nutrimentsPer100g: item.nutrimentsPer100g as Prisma.InputJsonValue,
            sortOrder,
          })),
        },
        minutes: content.minutes,
        name: content.name,
        servings: content.servings,
        steps: content.steps,
        userId,
      },
      include,
    }),
  );
}

export async function listRecipes(userId: string): Promise<RecipeView[]> {
  return (await prisma.recipe.findMany({ include, orderBy: { updatedAt: "desc" }, where: { userId } })).map(toRecipeView);
}

export async function getRecipe(userId: string, id: string): Promise<RecipeView | null> {
  const row = await prisma.recipe.findFirst({ include, where: { id, userId } });
  return row ? toRecipeView(row) : null;
}

export async function deleteRecipe(userId: string, id: string): Promise<boolean> {
  return (await prisma.recipe.deleteMany({ where: { id, userId } })).count > 0;
}

// Logs so many servings as their ingredients, so the diary counts every nutrient.
export async function logRecipe(input: {
  date?: string;
  label: MealView["label"];
  recipe: RecipeView;
  servings: number;
  userId: string;
}): Promise<MealView> {
  const share = input.servings / input.recipe.servings;
  return upsertMealItems({
    date: input.date,
    items: input.recipe.items.map((item) => ({
      amount: Math.max(0.1, Math.round(item.amount * share * 10) / 10),
      barcode: item.barcode ?? undefined,
      brand: item.brand ?? undefined,
      name: item.name,
      nutrimentsPer100g: item.nutrimentsPer100g,
      unit: item.unit,
    })),
    label: input.label,
    userId: input.userId,
  });
}
