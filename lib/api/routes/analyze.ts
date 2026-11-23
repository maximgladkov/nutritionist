import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resolveLocale } from "../../i18n/locales.ts";
import { computeItemNutrition, scaleNutriments, type NutrientValues } from "../../nutrition.ts";
import type { ProductNutriments } from "../../open-food-facts.ts";
import { prisma } from "../../prisma.ts";
import { chooseCatalogMatch } from "../../food-grounding.ts";
import { apiDeps, type RecognizedFood } from "../deps.ts";
import { ApiError, invalid } from "../errors.ts";
import { json, readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { findFoodByBarcode, foodBasis, getFood, searchFoods, servingsFor, userCountry, type FoodSummary, type ServingView } from "../foods.ts";
import { readAttachmentBytes, requireOwnedAttachments } from "./uploads.ts";

export type DraftMatch = "barcode" | "catalog" | "label" | "estimate";

export type DraftItem = {
  alternatives: FoodSummary[];
  amount: number;
  barcode: string | null;
  brand: string | null;
  foodId: string | null;
  key: string;
  match: DraftMatch;
  metrics: NutrientValues | null;
  name: string;
  nutrimentsPer100g: ProductNutriments;
  per100: NutrientValues;
  // Centre of the food in a meal photo (fractions of width and height), so the app can number it
  // on the image; null for other sources.
  position: { x: number; y: number } | null;
  // True when the item is not in the catalog yet and can be saved with POST /foods.
  saveable: boolean;
  // Serving size as printed on the pack ("40 g"), to send along when saving a label read.
  servingSize: string | null;
  servings: ServingView[];
  unit: "g" | "ml" | "serving";
};

const analyzeSchema = z.discriminatedUnion("source", [
  z.object({ barcode: z.string().trim().min(6), source: z.literal("barcode") }),
  z.object({ source: z.literal("label"), uploadIds: z.array(z.string().min(1)).min(1).max(3) }),
  z.object({ source: z.literal("photo"), text: z.string().trim().max(500).optional(), uploadIds: z.array(z.string().min(1)).min(1).max(3) }),
  z.object({ source: z.literal("text"), text: z.string().trim().min(2, "Describe what you ate.").max(2000) }),
]);

function metricsFor(amount: number, unit: DraftItem["unit"], nutriments: ProductNutriments, servingSize?: string | null) {
  try {
    return computeItemNutrition({ amount, nutriments, servingSize, unit }).metrics;
  } catch {
    return null;
  }
}

function nutrimentsFromRecognized(food: RecognizedFood): ProductNutriments {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(food.nutrimentsPer100g ?? {})) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      out[key] = value;
    }
  }
  return out as ProductNutriments;
}

function estimateItem(food: RecognizedFood, match: "label" | "estimate", alternatives: FoodSummary[]): DraftItem {
  const nutriments = nutrimentsFromRecognized(food);
  const basis = foodBasis(nutriments);
  const unit = food.unit === "serving" ? basis : food.unit;
  const servingSize = match === "label" ? food.servingSize?.trim() || null : null;
  return {
    alternatives,
    amount: food.amount,
    barcode: null,
    brand: food.brand?.trim() || null,
    foodId: null,
    key: randomUUID(),
    match,
    metrics: metricsFor(food.amount, unit, nutriments),
    name: food.name.trim(),
    nutrimentsPer100g: nutriments,
    per100: scaleNutriments(nutriments, 100, basis),
    position: food.position ?? null,
    saveable: match === "label",
    servingSize,
    servings: servingsFor({ quantity: null, servingSize }, basis),
    unit,
  };
}

async function catalogItem(foodId: string, amount: number, unit: DraftItem["unit"], match: DraftMatch, alternatives: FoodSummary[], country?: string): Promise<DraftItem> {
  const food = await getFood(foodId, country);
  const effectiveUnit = unit === "serving" && !food.servingSize ? food.unit : unit;
  return {
    alternatives,
    amount,
    barcode: food.barcode,
    brand: food.brand,
    foodId: food.id,
    key: randomUUID(),
    match,
    metrics: metricsFor(amount, effectiveUnit, food.nutrimentsPer100g, food.servingSize),
    name: food.name,
    nutrimentsPer100g: food.nutrimentsPer100g,
    per100: food.per100,
    position: null,
    saveable: false,
    servingSize: food.servingSize,
    servings: food.servings,
    unit: effectiveUnit,
  };
}

// How many catalog products to weigh for each recognized food.
const GROUNDING_CANDIDATES = 15;
const MAX_ALTERNATIVES = 3;

// Grounds a recognized food in the catalog: a product is used only when its name matches and its
// calories agree with the model's estimate (see food-grounding.ts). Otherwise the estimate stays,
// with the closest products offered as alternatives to swap in.
async function groundFood(food: RecognizedFood, country?: string): Promise<DraftItem> {
  const queries = [...new Set([food.brand ? `${food.brand} ${food.name}` : "", ...food.searchQueries, food.name].filter(Boolean))];
  const results = (await searchFoods(queries, country, GROUNDING_CANDIDATES)).filter((entry) => entry.hasNutrition);
  const estimate = nutrimentsFromRecognized(food);
  const { alternatives, match } = chooseCatalogMatch(
    {
      kcalPer100: estimate.energyKcal100g ?? estimate.energyKcal100ml,
      name: food.brand ? `${food.brand} ${food.name}` : food.name,
      searchQueries: food.searchQueries,
    },
    results,
  );
  const others = alternatives.slice(0, MAX_ALTERNATIVES);
  if (!match) {
    return estimateItem(food, "estimate", others);
  }
  const unit = food.unit === "serving" ? match.unit : food.unit;
  const item = await catalogItem(match.id, food.amount, unit, "catalog", others, country);
  return { ...item, position: food.position ?? null };
}

async function loadImages(userId: string, uploadIds: readonly string[]) {
  const rows = await requireOwnedAttachments(userId, uploadIds);
  return Promise.all(rows.map(async (row) => ({ bytes: await readAttachmentBytes(row), mediaType: row.mediaType })));
}

export const analyzeRoutes: RouteDefinition[] = [
  {
    async handler({ request, user }) {
      const body = await readJson(request, analyzeSchema);
      const country = await userCountry(user.id);
      if (body.source === "barcode") {
        const food = await findFoodByBarcode(body.barcode, country);
        if (!food) {
          throw new ApiError(404, "food_not_found", "We don't know this barcode yet. Scan the nutrition label to add it.");
        }
        const serving = food.servings.find((entry) => entry.label.startsWith("1 serving"));
        const item = await catalogItem(food.id, serving?.amount ?? 100, food.unit, "barcode", [], country);
        return json({ items: [item], note: null, source: body.source });
      }

      const profile = await prisma.userProfile.findUnique({ select: { locale: true }, where: { userId: user.id } });
      const images = "uploadIds" in body ? await loadImages(user.id, body.uploadIds) : [];
      let recognized: Awaited<ReturnType<ReturnType<typeof apiDeps>["recognizeFoods"]>>;
      try {
        recognized = await apiDeps().recognizeFoods({
          images,
          country,
          locale: resolveLocale(profile?.locale),
          source: body.source,
          text: "text" in body ? body.text : undefined,
        });
      } catch (error) {
        console.error("api: food recognition failed", error);
        throw new ApiError(502, "analysis_failed", "We couldn't read that. Try again or add the foods by hand.");
      }
      if (recognized.foods.length === 0) {
        throw invalid(recognized.note ?? "We couldn't find any food in that. Try again or add the foods by hand.");
      }
      const items =
        body.source === "label"
          ? recognized.foods.slice(0, 1).map((food) => estimateItem(food, "label", []))
          : await Promise.all(recognized.foods.map((food) => groundFood(food, country)));
      return json({ items, note: recognized.note ?? null, source: body.source });
    },
    method: "POST",
    path: "/log/analyze",
  },
];
