import type { Product, ProductNutriments, ProductSearchResult } from "./open-food-facts.ts";

const NUTRIMENT_KEYS = [
  "energyKcal100g",
  "proteins100g",
  "carbohydrates100g",
  "sugars100g",
  "fat100g",
  "saturatedFat100g",
  "fiber100g",
  "salt100g",
  "energyKcal100ml",
  "proteins100ml",
  "carbohydrates100ml",
  "sugars100ml",
  "fat100ml",
  "saturatedFat100ml",
  "fiber100ml",
  "salt100ml",
] as const satisfies readonly (keyof ProductNutriments)[];

export { NUTRIMENT_KEYS };

export function catalogNutrimentsHaveValues(nutriments: ProductNutriments) {
  return NUTRIMENT_KEYS.some((key) => typeof nutriments[key] === "number" && Number.isFinite(nutriments[key]));
}

export function mergeProductSearch(local: Product[], remote: ProductSearchResult): ProductSearchResult {
  const seen = new Set(remote.products.map((product) => product.barcode));
  const extra = local.filter((product) => product.barcode.length > 0 && !seen.has(product.barcode));
  return {
    count: remote.count + extra.length,
    page: remote.page,
    products: [...extra, ...remote.products],
  };
}

export function pickNutriments(value: ProductNutriments | Record<string, unknown>): ProductNutriments {
  const nutriments: ProductNutriments = {};
  for (const key of NUTRIMENT_KEYS) {
    const raw = value[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      nutriments[key] = raw;
    }
  }
  return nutriments;
}
