import type { Prisma } from "../../generated/prisma/client.ts";
import { getFood } from "../api/foods.ts";
import { ApiError } from "../api/errors.ts";
import { scaleNutriments, type NutrientValues } from "../nutrition.ts";
import type { ProductNutriments } from "../open-food-facts.ts";
import { prisma } from "../prisma.ts";
import { createRecipe, type RecipeContent, type RecipeView } from "../recipes.ts";
import { productKey } from "../user-products.ts";

// Things to look at in the conversation, as opposed to the meal cards (actions.ts). Kept apart from
// those because apps from before them would not know how to draw one.

export type DisplayFood = {
  amount: number;
  barcode: string | null;
  brand: string | null;
  favoriteKey: string;
  foodId: string;
  imageUrl: string | null;
  metrics: NutrientValues;
  name: string;
  nutrimentsPer100g: ProductNutriments;
  unit: "g" | "ml";
};

export type AssistantDisplay =
  | { foods: DisplayFood[]; id: string; kind: "foods" }
  // `recipeId` once it's been saved.
  | { id: string; kind: "recipe"; recipe: RecipeContent; recipeId: string | null };

type RecipePayload = { recipe: RecipeContent; recipeId?: string };

export const DISPLAY_KINDS = ["foods", "recipe"];

export function displayView(row: { id: string; kind: string; payload: Prisma.JsonValue; state: string }): AssistantDisplay {
  if (row.kind === "recipe") {
    const { recipe, recipeId } = row.payload as unknown as RecipePayload;
    return { id: row.id, kind: "recipe", recipe, recipeId: recipeId ?? null };
  }
  return { foods: (row.payload as unknown as { foods: DisplayFood[] }).foods, id: row.id, kind: "foods" };
}

async function record(input: { callId: string; kind: string; payload: object; sessionId: string; userId: string }) {
  const { callId, kind, sessionId, userId } = input;
  const payload = input.payload as Prisma.InputJsonValue;
  return displayView(
    await prisma.assistantAction.upsert({
      create: { callId, kind, payload, sessionId, userId },
      update: {},
      where: { userId_callId: { callId, userId } },
    }),
  );
}

// Foods from the catalog, by id. Ones that aren't there are left out, and said to be.
export async function showFoods(input: {
  callId: string;
  country?: string;
  foods: { amount?: number; id: string }[];
  sessionId: string;
  userId: string;
}): Promise<{ display: AssistantDisplay | null; missing: string[] }> {
  const missing: string[] = [];
  const found = await Promise.all(
    input.foods.map(async ({ amount = 100, id }): Promise<DisplayFood | null> => {
      try {
        const food = await getFood(id, input.country);
        return {
          amount,
          barcode: food.barcode,
          brand: food.brand,
          favoriteKey: productKey(food.barcode, food.name),
          foodId: food.id,
          imageUrl: food.imageUrl,
          metrics: scaleNutriments(food.nutrimentsPer100g, amount, food.unit),
          name: food.name,
          nutrimentsPer100g: food.nutrimentsPer100g,
          unit: food.unit,
        };
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          missing.push(id);
          return null;
        }
        throw error;
      }
    }),
  );
  const foods = found.flatMap((food) => (food ? [food] : []));
  const { callId, sessionId, userId } = input;
  const display = foods.length > 0 ? await record({ callId, kind: "foods", payload: { foods }, sessionId, userId }) : null;
  return { display, missing };
}

export async function showRecipe(input: {
  callId: string;
  recipe: RecipeContent;
  sessionId: string;
  userId: string;
}): Promise<AssistantDisplay> {
  const { callId, recipe, sessionId, userId } = input;
  return record({ callId, kind: "recipe", payload: { recipe }, sessionId, userId });
}

// Keeps a suggested recipe, once: the second tap finds it already there. Null when there's no such
// suggestion. One at a time per suggestion, so two taps can't make two recipes.
export async function saveRecipe(input: { id: string; userId: string }): Promise<{ display: AssistantDisplay; recipe: RecipeView | null } | null> {
  const where = { id: input.id, kind: "recipe", userId: input.userId };
  const row = await prisma.assistantAction.findFirst({ where });
  if (!row) return null;
  const claimed = await prisma.assistantAction.updateMany({ data: { state: "saved" }, where: { ...where, state: "open" } });
  if (claimed.count === 0) {
    const current = await prisma.assistantAction.findFirst({ where });
    return current && { display: displayView(current), recipe: null };
  }
  try {
    const payload = row.payload as unknown as RecipePayload;
    const recipe = await createRecipe(input.userId, payload.recipe);
    const saved: RecipePayload = { ...payload, recipeId: recipe.id };
    const next = await prisma.assistantAction.update({
      data: { payload: saved as unknown as Prisma.InputJsonValue },
      where: { id: row.id },
    });
    return { display: displayView(next), recipe };
  } catch (error) {
    await prisma.assistantAction.update({ data: { state: "open" }, where: { id: row.id } });
    throw error;
  }
}
