import {
  catalogNutrimentsHaveValues,
  findCatalogProductById,
  resolveProductByBarcode,
  searchCatalogAndOpenFoodFactsMany,
  type ProductSource,
} from "../catalog-product.ts";
import { hasPer100ml, parseServingSize, scaleNutriments, type NutrientValues } from "../nutrition.ts";
import { InvalidBarcodeError, isValidBarcode, type Product, type ProductNutriments } from "../open-food-facts.ts";
import { prisma } from "../prisma.ts";
import { searchProductsByEmbedding } from "../off-product-store.ts";
import { toVectorLiteral } from "../product-embeddings.ts";
import { apiDeps } from "./deps.ts";
import { notFound } from "./errors.ts";

export type ServingView = { amount: number; label: string; unit: "g" | "ml" | "serving" };

export type FoodSummary = {
  barcode: string | null;
  brand: string | null;
  hasNutrition: boolean;
  id: string;
  imageUrl: string | null;
  kcalPer100: number | null;
  name: string;
  nutrimentsPer100g: ProductNutriments;
  servings: ServingView[];
  source: ProductSource;
  unit: "g" | "ml";
};

export type FoodDetail = FoodSummary & {
  images: { id: string; kind: string; url: string }[];
  per100: NutrientValues;
  quantity: string | null;
  servingSize: string | null;
};

const CATALOG_PREFIX = "catalog:";

export function foodId(product: Pick<Product, "barcode" | "id">): string {
  if (product.barcode) {
    return product.barcode;
  }
  return `${CATALOG_PREFIX}${product.id ?? ""}`;
}

export function foodBasis(nutriments: ProductNutriments): "g" | "ml" {
  const hasPer100g = nutriments.energyKcal100g !== undefined || nutriments.proteins100g !== undefined;
  return !hasPer100g && hasPer100ml(nutriments) ? "ml" : "g";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function servingsFor(product: Pick<Product, "quantity" | "servingSize">, basis: "g" | "ml"): ServingView[] {
  const servings: ServingView[] = [{ amount: 100, label: `100 ${basis}`, unit: basis }];
  const serving = parseServingSize(product.servingSize);
  if (serving && serving.unit === basis && serving.amount !== 100) {
    servings.push({ amount: round(serving.amount), label: `1 serving (${round(serving.amount)} ${basis})`, unit: basis });
  }
  const pack = parseServingSize(product.quantity);
  if (pack && pack.unit === basis && !servings.some((entry) => entry.amount === round(pack.amount))) {
    servings.push({ amount: round(pack.amount), label: `Whole pack (${round(pack.amount)} ${basis})`, unit: basis });
  }
  return servings;
}

export function toFoodSummary(product: Product, source: ProductSource): FoodSummary {
  const basis = foodBasis(product.nutriments);
  return {
    barcode: product.barcode,
    brand: product.brands?.trim() || null,
    hasNutrition: catalogNutrimentsHaveValues(product.nutriments),
    id: foodId(product),
    imageUrl: product.images?.[0]?.url ?? product.imageUrl,
    kcalPer100: scaleNutriments(product.nutriments, 100, basis).energyKcal,
    name: product.name?.trim() || product.barcode || "Unnamed product",
    nutrimentsPer100g: product.nutriments,
    servings: servingsFor(product, basis),
    source,
    unit: basis,
  };
}

export function toFoodDetail(product: Product, source: ProductSource): FoodDetail {
  const summary = toFoodSummary(product, source);
  return {
    ...summary,
    images: (product.images ?? []).map((image) => ({ id: image.id, kind: image.kind, url: image.url })),
    per100: scaleNutriments(product.nutriments, 100, summary.unit),
    quantity: product.quantity,
    servingSize: product.servingSize,
  };
}

export async function userCountry(userId: string): Promise<string | undefined> {
  const profile = await prisma.userProfile.findUnique({ select: { country: true }, where: { userId } });
  return profile?.country ?? undefined;
}

export async function searchFoods(queries: readonly string[], country?: string, limit = 20): Promise<FoodSummary[]> {
  const result = await searchCatalogAndOpenFoodFactsMany(queries, { country });
  return result.products.slice(0, limit).map((product) =>
    toFoodSummary(product, product.source),
  );
}

// Foods closest in meaning to an embedded query, in any language.
export async function searchFoodsByMeaning(embedding: readonly number[], country?: string, limit = 20): Promise<FoodSummary[]> {
  const matches = await searchProductsByEmbedding(toVectorLiteral(embedding), { country, limit });
  return matches.map((match) => toFoodSummary(match.product, match.source));
}

// Spelling matches first (they are the most precise), then meaning matches the spelling search
// missed, such as the same food named in another language.
export function mergeFoodResults(...lists: readonly (readonly FoodSummary[])[]): FoodSummary[] {
  const seen = new Set<string>();
  const merged: FoodSummary[] = [];
  for (const list of lists) {
    for (const food of list) {
      const key = food.barcode ?? food.id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(food);
    }
  }
  return merged;
}

// Typed search: spelling and meaning together. Meaning search is skipped (spelling alone) when
// embeddings are unavailable or slow, so search never fails because of it.
export async function searchFoodsHybrid(query: string, country?: string, limit = 20): Promise<FoodSummary[]> {
  const meaning = apiDeps()
    .embedTexts([query])
    .then(([embedding]) => (embedding ? searchFoodsByMeaning(embedding, country, limit) : []))
    .catch((error: unknown) => {
      console.warn("api: meaning search unavailable", error);
      return [] as FoodSummary[];
    });
  const [spelling, similar] = await Promise.all([searchFoods([query], country, limit), meaning]);
  return mergeFoodResults(spelling, similar).slice(0, limit);
}

export async function findFoodByBarcode(barcode: string, country?: string): Promise<FoodDetail | null> {
  if (!isValidBarcode(barcode.trim())) {
    return null;
  }
  try {
    const result = await resolveProductByBarcode(barcode, { country });
    return result.found ? toFoodDetail(result.product, result.source) : null;
  } catch (error) {
    if (error instanceof InvalidBarcodeError) {
      return null;
    }
    throw error;
  }
}

export async function getFood(id: string, country?: string): Promise<FoodDetail> {
  if (id.startsWith(CATALOG_PREFIX)) {
    const product = await findCatalogProductById(id.slice(CATALOG_PREFIX.length));
    if (!product) {
      throw notFound("That food is not in the catalog.");
    }
    return toFoodDetail(product, "custom-catalog");
  }
  const food = await findFoodByBarcode(id, country);
  if (!food) {
    throw notFound("That food is not in the catalog.");
  }
  return food;
}
