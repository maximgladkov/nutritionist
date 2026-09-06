import { resolveProductByBarcode } from "./catalog-product.ts";
import { inferMealLabel } from "./meal-label.ts";
import { choosePackagedFoodName } from "./open-food-facts-name.ts";
import type { ProductNutriments } from "./open-food-facts.ts";
import { InvalidBarcodeError, isValidBarcode } from "./open-food-facts.ts";
import {
  type AmountUnit,
  type NutrientKey,
  type NutrientValues,
  computeItemNutrition,
  emptyNutrients,
  incompleteNutrients,
  NUTRIENT_KEYS,
  roundNutrient,
  ServingSizeError,
  sumNutrients,
} from "./nutrition.ts";
import { prisma } from "./prisma.ts";
import {
  formatDateInTimeZone,
  localDayRange,
  localInclusiveDateRange,
  normalizeTimezone,
  parseYmd,
} from "./timezone.ts";
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
  imageUrl: string | null;
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
  imageUrl: string | null;
  amount: number;
  unit: AmountUnit;
  grams: number;
  nutriments: ProductNutriments;
  metrics: NutrientValues;
};

const MAX_AMOUNT = 10000;
const MAX_ITEMS = 50;

export function scaleMealItemNutrition(input: {
  amount: number;
  grams: number;
  metrics: NutrientValues;
  newAmount: number;
}): { amount: number; grams: number; metrics: NutrientValues } {
  assertPositiveAmount(input.newAmount);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new MealError("amount must be a positive number");
  }
  if (input.newAmount === input.amount) {
    return {
      amount: input.amount,
      grams: input.grams,
      metrics: { ...input.metrics },
    };
  }
  const ratio = input.newAmount / input.amount;
  const metrics = emptyNutrients();
  for (const key of NUTRIENT_KEYS) {
    const value = input.metrics[key];
    metrics[key] = value === null ? null : roundNutrient(value * ratio);
  }
  return {
    amount: input.newAmount,
    grams: input.grams * ratio,
    metrics,
  };
}

export async function logMeal(input: {
  userId: string;
  eatenAt?: Date;
  label?: MealLabel;
  items: MealItemInput[];
  country?: string;
  signal?: AbortSignal;
}): Promise<MealView> {
  const resolved = await resolveItems(input.items, input.country, input.signal);
  const now = new Date();
  const eatenAt = input.eatenAt ?? now;
  const label = input.label ?? (await inferMealLabelForUser(input.userId, now));
  const meal = await prisma.meal.create({
    data: {
      userId: input.userId,
      eatenAt,
      label,
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

export type TodaysMealWrite =
  | { action: "append"; mealId: string }
  | { action: "create" };

export function todaysMealWrite(existingMealId: string | null | undefined): TodaysMealWrite {
  if (existingMealId) {
    return { action: "append", mealId: existingMealId };
  }
  return { action: "create" };
}

export function mealWriteRange(input: {
  date?: string;
  now?: Date;
  timeZone: string;
}): { from: Date; to: Date } {
  const date = input.date?.trim() ?? "";
  if (date === "") {
    return localDayRange(input.now ?? new Date(), input.timeZone);
  }
  const ymd = parseQueryDate(date, "date");
  try {
    return localInclusiveDateRange(input.timeZone, ymd, ymd);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new MealError(error.message);
    }
    throw error;
  }
}

export function eatenAtForCreate(
  eatenAt: Date | undefined,
  now: Date,
  range: { from: Date; to: Date },
): Date {
  const candidate = eatenAt ?? now;
  if (candidate >= range.from && candidate < range.to) {
    return candidate;
  }
  return range.from;
}

export async function upsertMealItems(input: {
  userId: string;
  items: MealItemInput[];
  label?: MealLabel;
  date?: string;
  eatenAt?: Date;
  now?: Date;
  country?: string;
  signal?: AbortSignal;
}): Promise<MealView> {
  const now = input.now ?? new Date();
  const timeZone = (await callerTimezone(input.userId)) ?? "UTC";
  const range = mealWriteRange({
    date: input.date,
    now: input.eatenAt ?? now,
    timeZone,
  });
  const label = input.label ?? inferMealLabel(now, timeZone);
  const existing = await prisma.meal.findFirst({
    where: {
      userId: input.userId,
      label,
      eatenAt: { gte: range.from, lt: range.to },
    },
    orderBy: { eatenAt: "desc" },
    select: { id: true },
  });
  const write = todaysMealWrite(existing?.id);
  if (write.action === "append") {
    return addMealItems({
      userId: input.userId,
      mealId: write.mealId,
      items: input.items,
      country: input.country,
      signal: input.signal,
    });
  }
  return logMeal({
    userId: input.userId,
    eatenAt: eatenAtForCreate(input.eatenAt, now, range),
    label,
    items: input.items,
    country: input.country,
    signal: input.signal,
  });
}

export async function addItemToTodaysMeal(input: {
  userId: string;
  label: MealLabel;
  item: MealItemInput;
  now?: Date;
  country?: string;
  signal?: AbortSignal;
}): Promise<MealView> {
  return upsertMealItems({
    userId: input.userId,
    label: input.label,
    items: [input.item],
    now: input.now,
    country: input.country,
    signal: input.signal,
  });
}

export async function updateMealItem(input: {
  userId: string;
  itemId: string;
  amount?: number;
  label?: MealLabel;
}): Promise<MealView> {
  if (input.amount === undefined && input.label === undefined) {
    throw new MealError("Provide an amount or a meal");
  }
  if (input.amount !== undefined) {
    assertPositiveAmount(input.amount);
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.mealItem.findFirst({
      where: { id: input.itemId, meal: { userId: input.userId } },
      include: { meal: true },
    });
    if (!item) {
      throw new MealError("Meal item not found");
    }

    const data: Prisma.MealItemUpdateInput = {};
    if (input.amount !== undefined && input.amount !== item.amount) {
      const scaled = scaleMealItemNutrition({
        amount: item.amount,
        grams: item.grams,
        metrics: {
          carbohydrates: item.carbohydrates,
          energyKcal: item.energyKcal,
          fat: item.fat,
          fiber: item.fiber,
          proteins: item.proteins,
          salt: item.salt,
          saturatedFat: item.saturatedFat,
          sugars: item.sugars,
        },
        newAmount: input.amount,
      });
      data.amount = scaled.amount;
      data.grams = scaled.grams;
      data.carbohydrates = scaled.metrics.carbohydrates;
      data.energyKcal = scaled.metrics.energyKcal;
      data.fat = scaled.metrics.fat;
      data.fiber = scaled.metrics.fiber;
      data.proteins = scaled.metrics.proteins;
      data.salt = scaled.metrics.salt;
      data.saturatedFat = scaled.metrics.saturatedFat;
      data.sugars = scaled.metrics.sugars;
    }

    let destMealId = item.mealId;
    if (input.label !== undefined && input.label !== item.meal.label) {
      const timeZone = (await callerTimezone(input.userId)) ?? "UTC";
      const date = formatDateInTimeZone(item.meal.eatenAt, timeZone);
      const range = mealWriteRange({ date, timeZone });
      const existing = await tx.meal.findFirst({
        where: {
          userId: input.userId,
          label: input.label,
          eatenAt: { gte: range.from, lt: range.to },
        },
        orderBy: { eatenAt: "desc" },
        select: { id: true },
      });
      if (existing) {
        destMealId = existing.id;
      } else {
        const created = await tx.meal.create({
          data: {
            eatenAt: eatenAtForCreate(item.meal.eatenAt, new Date(), range),
            label: input.label,
            userId: input.userId,
          },
          select: { id: true },
        });
        destMealId = created.id;
      }
      data.meal = { connect: { id: destMealId } };
    }

    if (Object.keys(data).length > 0) {
      await tx.mealItem.update({
        where: { id: item.id },
        data,
      });
    }

    if (destMealId !== item.mealId) {
      const remaining = await tx.mealItem.count({ where: { mealId: item.mealId } });
      if (remaining === 0) {
        await tx.meal.delete({ where: { id: item.mealId } });
      }
    }

    const meal = await tx.meal.findUniqueOrThrow({
      where: { id: destMealId },
      include: { items: true },
    });
    return toMealView(meal);
  });
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

export async function deleteMealItem(input: {
  userId: string;
  itemId: string;
}): Promise<{ deleted: true; itemId: string; mealId: string; mealDeleted: boolean }> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.mealItem.findFirst({
      where: { id: input.itemId, meal: { userId: input.userId } },
      select: { id: true, mealId: true },
    });
    if (!item) {
      throw new MealError("Meal item not found");
    }
    await tx.mealItem.delete({ where: { id: item.id } });
    const remaining = await tx.mealItem.count({ where: { mealId: item.mealId } });
    const mealDeleted = remaining === 0;
    if (mealDeleted) {
      await tx.meal.delete({ where: { id: item.mealId } });
    }
    return { deleted: true as const, itemId: item.id, mealId: item.mealId, mealDeleted };
  });
}

export function parseIsoDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new MealError(`${field} must be a valid ISO datetime`);
  }
  return date;
}

async function inferMealLabelForUser(userId: string, now: Date): Promise<MealLabel> {
  const timeZone = (await callerTimezone(userId)) ?? "UTC";
  return inferMealLabel(now, timeZone);
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
  if (fromValue === "" && toValue === "") {
    return localDayRange(input.now ?? new Date(), input.timeZone);
  }
  const fromDate = parseQueryDate(fromValue || toValue, fromValue ? "from" : "to");
  const toDate = parseQueryDate(toValue || fromValue, toValue ? "to" : "from");
  const start = fromDate <= toDate ? fromDate : toDate;
  const end = fromDate <= toDate ? toDate : fromDate;
  try {
    return localInclusiveDateRange(input.timeZone, start, end);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new MealError(error.message);
    }
    throw error;
  }
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
  assertPositiveAmount(item.amount);

  let name: string | undefined = item.name?.trim() || undefined;
  let barcode: string | null = null;
  let imageUrl: string | null = null;
  let nutriments: ProductNutriments = item.nutrimentsPer100g ?? {};
  let servingSize: string | null = null;

  if (item.barcode) {
    const normalizedBarcode = item.barcode.trim();
    if (isValidBarcode(normalizedBarcode)) {
      try {
        const result = await resolveProductByBarcode(normalizedBarcode, { country, signal });
        if (!result.found) {
          throw new MealError(`Product not found for barcode ${result.barcode}`);
        }
        barcode = result.product.barcode;
        imageUrl = result.product.imageUrl;
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
      imageUrl,
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
    imageUrl: item.imageUrl,
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
    imageUrl: string | null;
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
  imageUrl: string | null;
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
    imageUrl: item.imageUrl,
    amount: item.amount,
    unit: item.unit,
    grams: item.grams,
    metrics,
    incomplete: incompleteNutrients([metrics]),
  };
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MealError("amount must be a positive number");
  }
  if (amount > MAX_AMOUNT) {
    throw new MealError("amount is too large");
  }
}

function parseQueryDate(value: string, field: string): string {
  if (!parseYmd(value)) {
    throw new MealError(`${field} must be a valid YYYY-MM-DD date`);
  }
  return value.trim();
}

function assertRange(from: Date, to: Date): void {
  if (from.getTime() >= to.getTime()) {
    throw new MealError("from must be earlier than to");
  }
}
