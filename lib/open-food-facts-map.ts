import { countryTagsToIsoCodes } from "./off-country.ts";
import {
  pickProductName,
  preferredLanguageForCountry,
} from "./open-food-facts-name.ts";

const BARCODE_PATTERN = /^\d{8,14}$/;

export type ProductNutriments = {
  energyKcal100g?: number;
  proteins100g?: number;
  carbohydrates100g?: number;
  sugars100g?: number;
  fat100g?: number;
  saturatedFat100g?: number;
  fiber100g?: number;
  salt100g?: number;
  energyKcal100ml?: number;
  proteins100ml?: number;
  carbohydrates100ml?: number;
  sugars100ml?: number;
  fat100ml?: number;
  saturatedFat100ml?: number;
  fiber100ml?: number;
  salt100ml?: number;
};

export type Product = {
  barcode: string;
  name: string | null;
  brands: string | null;
  quantity: string | null;
  servingSize: string | null;
  nutriscoreGrade: string | null;
  novaGroup: number | null;
  ingredients: string | null;
  allergens: string | null;
  nutriments: ProductNutriments;
  imageUrl: string | null;
  countries: string[];
};

export class InvalidBarcodeError extends Error {
  constructor(barcode: string) {
    super(`Invalid barcode: ${barcode}`);
    this.name = "InvalidBarcodeError";
  }
}

export type OffApiProduct = {
  allergens?: unknown;
  brands?: unknown;
  code?: unknown;
  countries_tags?: unknown;
  image_small_url?: unknown;
  image_url?: unknown;
  ingredients_text?: unknown;
  nova_group?: unknown;
  nutriments?: Record<string, unknown>;
  nutriscore_grade?: unknown;
  product_name?: unknown;
  quantity?: unknown;
  serving_size?: unknown;
} & Record<string, unknown>;

export function normalizeBarcode(barcode: string): string {
  return barcode.replace(/\s+/g, "");
}

export function isValidBarcode(barcode: string): boolean {
  return BARCODE_PATTERN.test(normalizeBarcode(barcode));
}

const KJ_PER_KCAL = 4.184;

export function mapNutriments(nutriments: Record<string, unknown> | undefined): ProductNutriments {
  if (!nutriments) {
    return {};
  }
  return compactNutriments({
    energyKcal100g: numberOrUndefined(nutriments["energy-kcal_100g"]),
    proteins100g: numberOrUndefined(nutriments.proteins_100g),
    carbohydrates100g: numberOrUndefined(nutriments.carbohydrates_100g),
    sugars100g: numberOrUndefined(nutriments.sugars_100g),
    fat100g: numberOrUndefined(nutriments.fat_100g),
    saturatedFat100g: numberOrUndefined(nutriments["saturated-fat_100g"]),
    fiber100g: numberOrUndefined(nutriments.fiber_100g) ?? numberOrUndefined(nutriments.fibre_100g),
    salt100g: numberOrUndefined(nutriments.salt_100g),
    energyKcal100ml: numberOrUndefined(nutriments["energy-kcal_100ml"]),
    proteins100ml: numberOrUndefined(nutriments.proteins_100ml),
    carbohydrates100ml: numberOrUndefined(nutriments.carbohydrates_100ml),
    sugars100ml: numberOrUndefined(nutriments.sugars_100ml),
    fat100ml: numberOrUndefined(nutriments.fat_100ml),
    saturatedFat100ml: numberOrUndefined(nutriments["saturated-fat_100ml"]),
    fiber100ml: numberOrUndefined(nutriments.fiber_100ml) ?? numberOrUndefined(nutriments.fibre_100ml),
    salt100ml: numberOrUndefined(nutriments.salt_100ml),
  });
}

export function extractProductNutriments(product: Record<string, unknown>): ProductNutriments {
  const legacy = mapNutriments(asRecord(product.nutriments));
  if (Object.keys(legacy).length > 0) {
    return legacy;
  }
  return mapAggregatedNutriments(product.nutrition);
}

export function mapProductFields(product: OffApiProduct, fallbackBarcode?: string): {
  allergens: string | null;
  barcode: string;
  brands: string | null;
  imageUrl: string | null;
  ingredients: string | null;
  novaGroup: number | null;
  nutriscoreGrade: string | null;
  quantity: string | null;
  servingSize: string | null;
} {
  const barcode = stringOrNull(product.code) ?? fallbackBarcode ?? "";
  return {
    allergens: stringOrNull(product.allergens),
    barcode,
    brands: stringOrNull(product.brands),
    imageUrl: stringOrNull(product.image_small_url) ?? stringOrNull(product.image_url),
    ingredients: stringOrNull(product.ingredients_text),
    novaGroup: numberOrNull(product.nova_group),
    nutriscoreGrade: stringOrNull(product.nutriscore_grade),
    quantity: stringOrNull(product.quantity),
    servingSize: stringOrNull(product.serving_size),
  };
}

export function mapProduct(product: OffApiProduct, fallbackBarcode?: string, country?: string): Product {
  const fields = mapProductFields(product, fallbackBarcode);
  const countries = countryTagsToIsoCodes(product.countries_tags);
  return {
    ...fields,
    countries: countries.length > 0 ? countries : stringArray(product.countries_tags),
    name: pickProductName(product, preferredLanguageForCountry(country)),
    nutriments: extractProductNutriments(product),
  };
}

function mapAggregatedNutriments(nutrition: unknown): ProductNutriments {
  const aggregated = asRecord(asRecord(nutrition)?.aggregated_set);
  const nutrients = asRecord(aggregated?.nutrients);
  if (!nutrients) {
    return {};
  }
  const unit = aggregated?.per === "100ml" ? "100ml" : "100g";
  const energyKcal =
    nutrientValue(nutrients["energy-kcal"]) ??
    kjToKcal(nutrientValue(nutrients["energy-kj"]) ?? nutrientValue(nutrients.energy));
  const fiber = nutrientValue(nutrients.fiber) ?? nutrientValue(nutrients.fibre);
  if (unit === "100ml") {
    return compactNutriments({
      energyKcal100ml: energyKcal,
      proteins100ml: nutrientValue(nutrients.proteins),
      carbohydrates100ml: nutrientValue(nutrients.carbohydrates),
      sugars100ml: nutrientValue(nutrients.sugars),
      fat100ml: nutrientValue(nutrients.fat),
      saturatedFat100ml: nutrientValue(nutrients["saturated-fat"]),
      fiber100ml: fiber,
      salt100ml: nutrientValue(nutrients.salt),
    });
  }
  return compactNutriments({
    energyKcal100g: energyKcal,
    proteins100g: nutrientValue(nutrients.proteins),
    carbohydrates100g: nutrientValue(nutrients.carbohydrates),
    sugars100g: nutrientValue(nutrients.sugars),
    fat100g: nutrientValue(nutrients.fat),
    saturatedFat100g: nutrientValue(nutrients["saturated-fat"]),
    fiber100g: fiber,
    salt100g: nutrientValue(nutrients.salt),
  });
}

function nutrientValue(entry: unknown): number | undefined {
  if (typeof entry === "number" || typeof entry === "string") {
    return numberOrUndefined(entry);
  }
  const record = asRecord(entry);
  if (!record) {
    return undefined;
  }
  return numberOrUndefined(record.value) ?? numberOrUndefined(record.value_computed);
}

function kjToKcal(kj: number | undefined): number | undefined {
  return kj === undefined ? undefined : Math.round((kj / KJ_PER_KCAL) * 10) / 10;
}

function compactNutriments(nutriments: ProductNutriments): ProductNutriments {
  const compacted: ProductNutriments = {};
  for (const [key, value] of Object.entries(nutriments)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      compacted[key as keyof ProductNutriments] = value;
    }
  }
  return compacted;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
