import type { ProductNutriments } from "./open-food-facts.ts";

export const NUTRIENT_KEYS = [
  "energyKcal",
  "proteins",
  "carbohydrates",
  "sugars",
  "fat",
  "saturatedFat",
  "fiber",
  "salt",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type NutrientValues = Record<NutrientKey, number | null>;
export type AmountUnit = "g" | "ml" | "serving";

export class ServingSizeError extends Error {
  constructor(servingSize: string | null | undefined) {
    super(
      servingSize
        ? `Could not parse serving size "${servingSize}". Ask for amount in g or ml.`
        : "Serving size is missing. Ask for amount in g or ml.",
    );
    this.name = "ServingSizeError";
  }
}

const PER_100G: Record<NutrientKey, keyof ProductNutriments> = {
  energyKcal: "energyKcal100g",
  proteins: "proteins100g",
  carbohydrates: "carbohydrates100g",
  sugars: "sugars100g",
  fat: "fat100g",
  saturatedFat: "saturatedFat100g",
  fiber: "fiber100g",
  salt: "salt100g",
};

const PER_100ML: Record<NutrientKey, keyof ProductNutriments> = {
  energyKcal: "energyKcal100ml",
  proteins: "proteins100ml",
  carbohydrates: "carbohydrates100ml",
  sugars: "sugars100ml",
  fat: "fat100ml",
  saturatedFat: "saturatedFat100ml",
  fiber: "fiber100ml",
  salt: "salt100ml",
};

const SERVING_SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|cl|l)\b/gi;

export function emptyNutrients(): NutrientValues {
  return {
    energyKcal: null,
    proteins: null,
    carbohydrates: null,
    sugars: null,
    fat: null,
    saturatedFat: null,
    fiber: null,
    salt: null,
  };
}

export function hasPer100ml(nutriments: ProductNutriments): boolean {
  return NUTRIENT_KEYS.some((key) => nutriments[PER_100ML[key]] !== undefined);
}

export function parseServingSize(
  value: string | null | undefined,
): { amount: number; unit: "g" | "ml" } | null {
  if (!value) {
    return null;
  }
  const matches = [...value.matchAll(SERVING_SIZE_PATTERN)];
  const last = matches.at(-1);
  if (!last?.[1] || !last[2]) {
    return null;
  }
  const quantity = Number(last[1]);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  const unit = last[2].toLowerCase();
  if (unit === "g") {
    return { amount: quantity, unit: "g" };
  }
  if (unit === "kg") {
    return { amount: quantity * 1000, unit: "g" };
  }
  if (unit === "mg") {
    return { amount: quantity / 1000, unit: "g" };
  }
  if (unit === "ml") {
    return { amount: quantity, unit: "ml" };
  }
  if (unit === "cl") {
    return { amount: quantity * 10, unit: "ml" };
  }
  if (unit === "l") {
    return { amount: quantity * 1000, unit: "ml" };
  }
  return null;
}

export function computeItemNutrition(input: {
  amount: number;
  unit: AmountUnit;
  servingSize?: string | null;
  nutriments: ProductNutriments;
}): { grams: number; metrics: NutrientValues } {
  const { quantity, basis } = resolveQuantity(input);
  return {
    grams: quantity,
    metrics: scaleNutriments(input.nutriments, quantity, basis),
  };
}

export function scaleNutriments(
  nutriments: ProductNutriments,
  quantity: number,
  basis: "g" | "ml",
): NutrientValues {
  const fields = basis === "ml" ? PER_100ML : PER_100G;
  const metrics = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    metrics[key] = scaleValue(nutriments[fields[key]], quantity);
  }
  return metrics;
}

export function sumNutrients(rows: readonly NutrientValues[]): NutrientValues {
  const totals = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    let any = false;
    let total = 0;
    for (const row of rows) {
      const value = row[key];
      if (value !== null) {
        total += value;
        any = true;
      }
    }
    totals[key] = any ? roundNutrient(total) : null;
  }
  return totals;
}

export function incompleteNutrients(rows: readonly NutrientValues[]): NutrientKey[] {
  if (rows.length === 0) {
    return [...NUTRIENT_KEYS];
  }
  return NUTRIENT_KEYS.filter((key) => rows.some((row) => row[key] === null));
}

export function roundNutrient(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveQuantity(input: {
  amount: number;
  unit: AmountUnit;
  servingSize?: string | null;
  nutriments: ProductNutriments;
}): { quantity: number; basis: "g" | "ml" } {
  if (input.unit === "g") {
    return { quantity: input.amount, basis: "g" };
  }
  if (input.unit === "ml") {
    return {
      quantity: input.amount,
      basis: hasPer100ml(input.nutriments) ? "ml" : "g",
    };
  }
  const serving = parseServingSize(input.servingSize);
  if (!serving) {
    throw new ServingSizeError(input.servingSize);
  }
  const quantity = input.amount * serving.amount;
  if (serving.unit === "ml") {
    return {
      quantity,
      basis: hasPer100ml(input.nutriments) ? "ml" : "g",
    };
  }
  return { quantity, basis: "g" };
}

function scaleValue(per100: number | undefined, quantity: number): number | null {
  if (per100 === undefined) {
    return null;
  }
  return roundNutrient((per100 * quantity) / 100);
}
