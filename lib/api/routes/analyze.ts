import { randomUUID } from "node:crypto";
import { z } from "zod";
import { resolveLocale } from "../../i18n/locales.ts";
import { computeItemNutrition, scaleNutriments, type NutrientValues } from "../../nutrition.ts";
import type { ProductNutriments } from "../../open-food-facts.ts";
import { prisma } from "../../prisma.ts";
import { chooseCatalogMatch, kcalPlausible } from "../../food-grounding.ts";
import { apiDeps, type RecognizedFood } from "../deps.ts";
import { ApiError, invalid } from "../errors.ts";
import { json, readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import {
  findFoodByBarcode,
  foodBasis,
  getFood,
  mergeFoodResults,
  searchFoods,
  searchFoodsByMeaning,
  searchGenericFoods,
  searchGenericFoodsByMeaning,
  servingsFor,
  userCountry,
  type FoodSummary,
  type ServingView,
} from "../foods.ts";
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

// How many catalog products each search contributes, and how many the AI chooses between.
const SPELLING_CANDIDATES = 15;
const MEANING_CANDIDATES = 10;
const GENERIC_CANDIDATES = 4;
const PICK_CANDIDATES = 10;

function interleave<T>(first: readonly T[], second: readonly T[]): T[] {
  const out: T[] = [];
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    if (index < first.length) out.push(first[index]!);
    if (index < second.length) out.push(second[index]!);
  }
  return out;
}
const MAX_ALTERNATIVES = 3;

function kcalEstimate(food: RecognizedFood): number | undefined {
  const estimate = nutrimentsFromRecognized(food);
  return estimate.energyKcal100g ?? estimate.energyKcal100ml;
}

function groundingQueries(food: RecognizedFood): string[] {
  return [...new Set([food.brand ? `${food.brand} ${food.name}` : "", ...food.searchQueries, food.name].filter(Boolean))];
}

// Products that might be this food: spelling matches first, then products close in meaning (the
// same food named in another language, or worded differently).
async function candidatesFor(food: RecognizedFood, embedding: number[] | undefined, country?: string): Promise<FoodSummary[]> {
  const queries = groundingQueries(food);
  const [spelling, genericByName, genericByMeaning, meaning] = await Promise.all([
    searchFoods(queries, country, SPELLING_CANDIDATES),
    // Plain foods (a fried egg, toast, brewed coffee) live in the generic reference table.
    searchGenericFoods(queries, GENERIC_CANDIDATES).catch(() => []),
    embedding ? searchGenericFoodsByMeaning(embedding, GENERIC_CANDIDATES).catch(() => []) : Promise.resolve([]),
    embedding ? searchFoodsByMeaning(embedding, country, MEANING_CANDIDATES).catch(() => []) : Promise.resolve([]),
  ]);
  // Meaning finds generic foods more reliably than spelling; interleave so the shortlist always
  // holds both packaged products and generic foods.
  const generic = mergeFoodResults(genericByMeaning, genericByName);
  return mergeFoodResults(interleave(spelling, generic), meaning).filter((entry) => entry.hasNutrition);
}

// Which candidate each food is: the AI decides (one call for the whole meal), guarded by a calorie
// check; when the AI step is unavailable, name-and-calorie rules decide instead.
async function chooseProducts(foods: readonly RecognizedFood[], candidates: readonly FoodSummary[][]): Promise<(FoodSummary | null)[]> {
  const shortlists = candidates.map((list) => list.slice(0, PICK_CANDIDATES));
  try {
    const picks = await apiDeps().pickMatches(
      foods.map((food, index) => ({
        amount: food.amount,
        candidates: shortlists[index]!.map((entry) => ({
          brand: entry.source === "generic" ? "generic reference food" : entry.brand,
          kcalPer100: entry.kcalPer100,
          name: entry.name,
          per100: entry.nutrimentsPer100g as Record<string, number>,
        })),
        estimate: nutrimentsFromRecognized(food) as Record<string, number>,
        name: food.name,
        unit: food.unit,
      })),
    );
    return foods.map((food, index) => {
      const pick = picks[index];
      const chosen = pick === null || pick === undefined ? null : (shortlists[index]![pick] ?? null);
      return chosen && kcalPlausible(kcalEstimate(food), chosen.kcalPer100) ? chosen : null;
    });
  } catch (error) {
    console.warn("api: AI product matching unavailable, using rules", error);
    return foods.map(
      (food, index) =>
        chooseCatalogMatch(
          { kcalPer100: kcalEstimate(food), name: food.brand ? `${food.brand} ${food.name}` : food.name, searchQueries: food.searchQueries },
          candidates[index]!,
        ).match,
    );
  }
}

// Grounds recognized foods in the catalog so logged nutrition comes from real product data where
// a product matches; the AI's estimate stays for foods no product matches (with the closest
// products offered as alternatives to swap in).
async function groundFoods(foods: readonly RecognizedFood[], country?: string): Promise<DraftItem[]> {
  const embeddings = await apiDeps()
    .embedTexts(foods.map((food) => [food.name, ...food.searchQueries].join(" · ")))
    .catch((error: unknown) => {
      console.warn("api: embeddings unavailable for grounding", error);
      return [] as number[][];
    });
  const candidates = await Promise.all(foods.map((food, index) => candidatesFor(food, embeddings[index], country)));
  const chosen = await chooseProducts(foods, candidates);
  return Promise.all(
    foods.map(async (food, index) => {
      const match = chosen[index];
      const others = candidates[index]!.filter((entry) => entry.id !== match?.id).slice(0, MAX_ALTERNATIVES);
      if (!match) {
        return estimateItem(food, "estimate", others);
      }
      const unit = food.unit === "serving" ? match.unit : food.unit;
      const item = await catalogItem(match.id, food.amount, unit, "catalog", others, country);
      if (match.source === "generic") {
        // Reference values under the name the user knows ("Huevo frito", not "Egg, whole, cooked,
        // fried"), logged by name and nutrition rather than as a product.
        return { ...item, brand: null, foodId: null, name: food.name, position: food.position ?? null };
      }
      return { ...item, position: food.position ?? null };
    }),
  );
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
        // Known product, but no nutrition on file (Open Food Facts often has just a name): logging it
        // would add 0 kcal of everything. Same answer as an unknown barcode, so the app offers to scan
        // the label, which saves the nutrition for everyone who scans it next.
        if (!food.hasNutrition) {
          throw new ApiError(
            404,
            "food_not_found",
            `We know ${food.name} but not its nutrition yet. Scan the nutrition label to add it.`,
          );
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
          : await groundFoods(recognized.foods, country);
      return json({ items, note: recognized.note ?? null, source: body.source });
    },
    method: "POST",
    path: "/log/analyze",
  },
];
