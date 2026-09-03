import { resolveProductByBarcode } from "./catalog-product.ts";
import { choosePackagedFoodName } from "./open-food-facts-name.ts";
import type { ProductNutriments } from "./open-food-facts.ts";
import { InvalidBarcodeError } from "./open-food-facts.ts";
import {
  type AmountUnit,
  type NutrientKey,
  type NutrientValues,
  computeItemNutrition,
  incompleteNutrients,
  ServingSizeError,
  sumNutrients,
} from "./nutrition.ts";
import { prisma } from "./prisma.ts";
import { formatDateInTimeZone, localDayRange, normalizeTimezone } from "./timezone.ts";
import type { MealItemUnit, MealLabel, Prisma } from "../generated/prisma/client";

export class MealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MealError";
  }
}

export type MealItemInput = {
  barcode?: string;
  name?: string;
  amount: number;
  unit: AmountUnit;
  nutrimentsPer100g?: ProductNutriments;
};

export type MealItemView = {
  id: string;
  name: string;
  barcode: string | null;
  amount: number;
  unit: AmountUnit;
  grams: number;
  metrics: NutrientValues;
  incomplete: NutrientKey[];
};

export type MealView = {
  id: string;
  eatenAt: string;
  label: MealLabel;
  items: MealItemView[];
  totals: NutrientValues;
  incomplete: NutrientKey[];
};

export type NutritionSummary = {
  from: string;
  to: string;
  mealCount: number;
  itemCount: number;
  totals: NutrientValues;
  incomplete: NutrientKey[];
  days?: {
    date: string;
    mealCount: number;
    itemCount: number;
    totals: NutrientValues;
    incomplete: NutrientKey[];
  }[];
};

type ResolvedItem = {
  name: string;
  barcode: string | null;
  amount: number;
  unit: AmountUnit;
  grams: number;
  nutriments: ProductNutriments;
  metrics: NutrientValues;
};

const MAX_AMOUNT = 10000;
const MAX_ITEMS = 50;

export async function logMeal(input: {
  userId: string;
  eatenAt?: Date;
  label: MealLabel;
  items: MealItemInput[];
  country?: string;
  signal?: AbortSignal;
}): Promise<MealView> {
  const resolved = await resolveItems(input.items, input.country, input.signal);
  const meal = await prisma.meal.create({
    data: {
      userId: input.userId,
      eatenAt: input.eatenAt ?? new Date(),
      label: input.label,
      items: { create: resolved.map(toCreateData) },
    },
    include: { items: true },
  });
  return toMealView(meal);
}

export async function addMealItems(input: {
  userId: string;
  mealId: string;
  items: MealItemInput[];
  country?: string;
  signal?: AbortSignal;
}): Promise<MealView> {
  const meal = await prisma.meal.findFirst({
    where: { id: input.mealId, userId: input.userId },
    select: { id: true },
  });
  if (!meal) {
    throw new MealError("Meal not found");
  }
  const resolved = await resolveItems(input.items, input.country, input.signal);
  const updated = await prisma.meal.update({
    where: { id: meal.id },
    data: { items: { create: resolved.map(toCreateData) } },
    include: { items: true },
  });
  return toMealView(updated);
}

export async function listMeals(input: {
  userId: string;
  from: Date;
  to: Date;
  label?: MealLabel;
}): Promise<{ from: string; to: string; meals: MealView[] }> {
  assertRange(input.from, input.to);
  const meals = await prisma.meal.findMany({
    where: {
      userId: input.userId,
      eatenAt: { gte: input.from, lt: input.to },
      ...(input.label ? { label: input.label } : {}),
    },
    include: { items: true },
    orderBy: { eatenAt: "asc" },
  });
  return {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    meals: meals.map(toMealView),
  };
}

export async function summarizeNutrition(input: {
  userId: string;
  from: Date;
  to: Date;
  groupBy?: "day";
  timezone?: string;
}): Promise<NutritionSummary> {
  assertRange(input.from, input.to);
  const meals = await prisma.meal.findMany({
    where: {
      userId: input.userId,
      eatenAt: { gte: input.from, lt: input.to },
    },
    include: { items: true },
    orderBy: { eatenAt: "asc" },
  });
  const views = meals.map(toMealView);
  const itemMetrics = views.flatMap((meal) => meal.items.map((item) => item.metrics));
  const summary: NutritionSummary = {
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    mealCount: views.length,
    itemCount: itemMetrics.length,
    totals: sumNutrients(itemMetrics),
    incomplete: incompleteNutrients(itemMetrics),
  };
  if (input.groupBy === "day") {
    const timeZone = input.timezone ? (normalizeTimezone(input.timezone) ?? "UTC") : "UTC";
    const byDay = new Map<string, MealView[]>();
    for (const meal of views) {
      const date = formatDateInTimeZone(new Date(meal.eatenAt), timeZone);
      const bucket = byDay.get(date) ?? [];
      bucket.push(meal);
      byDay.set(date, bucket);
    }
    summary.days = [...byDay.entries()].map(([date, dayMeals]) => {
      const metrics = dayMeals.flatMap((meal) => meal.items.map((item) => item.metrics));
      return {
        date,
        mealCount: dayMeals.length,
        itemCount: metrics.length,
        totals: sumNutrients(metrics),
        incomplete: incompleteNutrients(metrics),
      };
    });
  }
  return summary;
}

export async function deleteMeal(input: {
  userId: string;
  mealId: string;
}): Promise<{ deleted: true; mealId: string }> {
  const result = await prisma.meal.deleteMany({
    where: { id: input.mealId, userId: input.userId },
  });
  if (result.count === 0) {
    throw new MealError("Meal not found");
  }
  return { deleted: true, mealId: input.mealId };
}

export function parseIsoDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new MealError(`${field} must be a valid ISO datetime`);
  }
  return date;
}

export async function callerTimezone(userId: string, override?: string): Promise<string | undefined> {
  if (override !== undefined && override !== "") {
    const normalized = normalizeTimezone(override);
    if (!normalized) {
      throw new MealError("timezone must be a valid IANA time zone");
    }
    return normalized;
  }
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { timezone: true },
  });
  return profile?.timezone ?? undefined;
}

export function mealQueryRange(input: {
  from?: string;
  to?: string;
  now?: Date;
  timeZone: string;
}): { from: Date; to: Date } {
  const fromValue = input.from?.trim() ?? "";
  const toValue = input.to?.trim() ?? "";
  if ((fromValue === "") !== (toValue === "")) {
    throw new MealError("from and to must both be provided");
  }
  if (fromValue === "" || toValue === "") {
    return localDayRange(input.now ?? new Date(), input.timeZone);
  }
  const from = parseIsoDate(fromValue, "from");
  const to = parseIsoDate(toValue, "to");
  assertRange(from, to);
  return { from, to };
}

async function resolveItems(
  items: MealItemInput[],
  country: string | undefined,
  signal: AbortSignal | undefined,
): Promise<ResolvedItem[]> {
  if (items.length === 0) {
    throw new MealError("Provide at least one item");
  }
  if (items.length > MAX_ITEMS) {
    throw new MealError(`A meal can have at most ${MAX_ITEMS} items`);
  }
  const resolved: ResolvedItem[] = [];
  for (const item of items) {
    resolved.push(await resolveItem(item, country, signal));
  }
  return resolved;
}

async function resolveItem(
  item: MealItemInput,
  country: string | undefined,
  signal: AbortSignal | undefined,
): Promise<ResolvedItem> {
  if (!Number.isFinite(item.amount) || item.amount <= 0) {
    throw new MealError("amount must be a positive number");
  }
  if (item.amount > MAX_AMOUNT) {
    throw new MealError("amount is too large");
  }

  let name: string | undefined = item.name?.trim() || undefined;
  let barcode: string | null = null;
  let nutriments: ProductNutriments = item.nutrimentsPer100g ?? {};
  let servingSize: string | null = null;

  if (item.barcode) {
    try {
      const result = await resolveProductByBarcode(item.barcode, { country, signal });
      if (!result.found) {
        throw new MealError(`Product not found for barcode ${result.barcode}`);
      }
      barcode = result.product.barcode;
      name = choosePackagedFoodName({
        barcode: result.product.barcode,
        productName: result.product.name,
        providedName: name,
      });
      nutriments = result.product.nutriments;
      servingSize = result.product.servingSize;
    } catch (error) {
      if (error instanceof InvalidBarcodeError) {
        throw new MealError(error.message);
      }
      throw error;
    }
  }
  if (!name) {
    throw new MealError("name is required when barcode is not provided");
  }

  try {
    const computed = computeItemNutrition({
      amount: item.amount,
      unit: item.unit,
      servingSize,
      nutriments,
    });
    return {
      name,
      barcode,
      amount: item.amount,
      unit: item.unit,
      grams: computed.grams,
      nutriments,
      metrics: computed.metrics,
    };
  } catch (error) {
    if (error instanceof ServingSizeError) {
      throw new MealError(error.message);
    }
    throw error;
  }
}

function toCreateData(item: ResolvedItem): Prisma.MealItemCreateWithoutMealInput {
  return {
    name: item.name,
    barcode: item.barcode,
    amount: item.amount,
    unit: item.unit as MealItemUnit,
    grams: item.grams,
    nutrimentsPer100g: nutrimentsToJson(item.nutriments),
    energyKcal: item.metrics.energyKcal,
    proteins: item.metrics.proteins,
    carbohydrates: item.metrics.carbohydrates,
    sugars: item.metrics.sugars,
    fat: item.metrics.fat,
    saturatedFat: item.metrics.saturatedFat,
    fiber: item.metrics.fiber,
    salt: item.metrics.salt,
  };
}

function nutrimentsToJson(nutriments: ProductNutriments): Prisma.InputJsonValue {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(nutriments)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

function toMealView(meal: {
  id: string;
  eatenAt: Date;
  label: MealLabel;
  items: {
    id: string;
    name: string;
    barcode: string | null;
    amount: number;
    unit: MealItemUnit;
    grams: number;
    energyKcal: number | null;
    proteins: number | null;
    carbohydrates: number | null;
    sugars: number | null;
    fat: number | null;
    saturatedFat: number | null;
    fiber: number | null;
    salt: number | null;
  }[];
}): MealView {
  const items = meal.items.map(toItemView);
  const metrics = items.map((item) => item.metrics);
  return {
    id: meal.id,
    eatenAt: meal.eatenAt.toISOString(),
    label: meal.label,
    items,
    totals: sumNutrients(metrics),
    incomplete: incompleteNutrients(metrics),
  };
}

function toItemView(item: {
  id: string;
  name: string;
  barcode: string | null;
  amount: number;
  unit: MealItemUnit;
  grams: number;
  energyKcal: number | null;
  proteins: number | null;
  carbohydrates: number | null;
  sugars: number | null;
  fat: number | null;
  saturatedFat: number | null;
  fiber: number | null;
  salt: number | null;
}): MealItemView {
  const metrics: NutrientValues = {
    energyKcal: item.energyKcal,
    proteins: item.proteins,
    carbohydrates: item.carbohydrates,
    sugars: item.sugars,
    fat: item.fat,
    saturatedFat: item.saturatedFat,
    fiber: item.fiber,
    salt: item.salt,
  };
  return {
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    amount: item.amount,
    unit: item.unit,
    grams: item.grams,
    metrics,
    incomplete: incompleteNutrients([metrics]),
  };
}

function assertRange(from: Date, to: Date): void {
  if (from.getTime() >= to.getTime()) {
    throw new MealError("from must be earlier than to");
  }
}
