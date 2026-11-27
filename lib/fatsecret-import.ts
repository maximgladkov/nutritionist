import type { MealLabel } from "../generated/prisma/client.ts";
import { apiDeps } from "./api/deps.ts";
import { pushToUser } from "./api/push.ts";
import type { Locale } from "./i18n/locales.ts";
import { pushCopy, userLocale, type ImportCounts } from "./push-copy.ts";
import { fatSecretDateInt, fatSecretYmd, type FatSecretFoodEntry, type FatSecretServing, type FatSecretTokens } from "./fatsecret.ts";
import { upsertMealItems, type MealItemInput } from "./meals.ts";
import { parseServingSize } from "./nutrition.ts";
import { prisma } from "./prisma.ts";
import { openSecret } from "./secret-box.ts";
import { parseYmd, zonedLocalToUtc } from "./timezone.ts";

export const FATSECRET_SOURCE = "fatsecret";

// How far back the import looks, and how many empty months in a row end it early (someone who
// used FatSecret in 2019 and again this year still gets both stretches).
export const FATSECRET_MAX_MONTHS = 180;
export const FATSECRET_EMPTY_MONTHS_TO_STOP = 24;

const MEAL_LABELS: Record<string, MealLabel> = {
  breakfast: "breakfast",
  dinner: "dinner",
  lunch: "lunch",
};

// When each meal is placed on its day, in the user's own time zone: FatSecret only records the day.
const MEAL_TIMES: Record<MealLabel, { hour: number; minute: number }> = {
  breakfast: { hour: 8, minute: 30 },
  dinner: { hour: 20, minute: 0 },
  lunch: { hour: 13, minute: 30 },
  other: { hour: 16, minute: 30 },
  snack: { hour: 16, minute: 30 },
};

const OUNCE_GRAMS = 28.3495;

function number(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function fatSecretMealLabel(meal: string): MealLabel {
  return MEAL_LABELS[meal.trim().toLowerCase()] ?? "snack";
}

// Grams (or ml) in one unit of the entry's serving: from FatSecret's own serving data when the food
// is public, else read from the description ("1 porción, 250 ml"); null when neither says.
export function metricPerUnit(
  entry: FatSecretFoodEntry,
  servings: readonly FatSecretServing[] | null,
): { amount: number; unit: "g" | "ml" } | null {
  const serving = servings?.find((candidate) => candidate.serving_id === entry.serving_id);
  const metric = number(serving?.metric_serving_amount);
  const units = number(serving?.number_of_units) ?? 1;
  if (serving && metric !== undefined && metric > 0 && units > 0) {
    const unit = serving.metric_serving_unit?.trim().toLowerCase();
    if (unit === "g" || unit === "ml") return { amount: metric / units, unit };
    if (unit === "oz") return { amount: (metric * OUNCE_GRAMS) / units, unit: "g" };
  }
  return parseServingSize(entry.food_entry_description);
}

// One FatSecret entry as a meal item. FatSecret gives nutrients for the whole entry; meal items keep
// nutrition per 100 g plus the amount, so totals are spread over the entry's grams.
export function fatSecretEntryToItem(
  entry: FatSecretFoodEntry,
  servings: readonly FatSecretServing[] | null,
): { item: MealItemInput; label: MealLabel } {
  const units = number(entry.number_of_units) ?? 1;
  const perUnit = metricPerUnit(entry, servings);
  // Without a weight, count each unit as 100 g so the logged calories still match FatSecret.
  const amount = Math.max(0.1, Math.round((perUnit ? perUnit.amount * units : 100 * units) * 10) / 10);
  const unit = perUnit?.unit ?? "g";
  const per100 = (value: string | undefined) => {
    const total = number(value);
    return total === undefined ? undefined : Math.round(((total * 100) / amount) * 1000) / 1000;
  };
  const sodiumMg = number(entry.sodium);
  const nutriments = Object.fromEntries(
    Object.entries({
      carbohydrates100g: per100(entry.carbohydrate),
      energyKcal100g: per100(entry.calories),
      fat100g: per100(entry.fat),
      fiber100g: per100(entry.fiber),
      proteins100g: per100(entry.protein),
      // Sodium in mg → salt in g (salt is 2.5 × sodium).
      salt100g: sodiumMg === undefined ? undefined : Math.round(((sodiumMg * 2.5) / 1000) * (100 / amount) * 1000) / 1000,
      saturatedFat100g: per100(entry.saturated_fat),
      sugars100g: per100(entry.sugar),
    }).filter(([, value]) => value !== undefined),
  );
  return {
    item: { amount, name: entry.food_entry_name.trim() || "FatSecret food", nutrimentsPer100g: nutriments, unit },
    label: fatSecretMealLabel(entry.meal),
  };
}

export async function fatSecretAccess(userId: string): Promise<FatSecretTokens> {
  const connection = await prisma.fatSecretConnection.findUnique({ where: { userId } });
  if (!connection || connection.status !== "connected" || !connection.accessToken || !connection.accessSecret) {
    throw new Error("FatSecret is not connected");
  }
  return { secret: openSecret(connection.accessSecret), token: openSecret(connection.accessToken) };
}

function earlier(current: string | null, next: string): string {
  return current === null || next < current ? next : current;
}

function mealTime(ymd: string, label: MealLabel, timeZone: string): Date {
  const parts = parseYmd(ymd)!;
  return zonedLocalToUtc({ ...parts, ...MEAL_TIMES[label], timeZone });
}

// The first of the month `offset` months before `from` (YYYY-MM).
export function monthBefore(from: string, offset: number): string {
  const [year, month] = from.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 - offset, 1));
  return date.toISOString().slice(0, 7);
}

export type MonthImportResult = { days: number; entries: number; month: string; oldestDate: string | null; weights: number };

// Imports one month of diary and weights. Safe to run again: entries already imported (or deleted
// after importing) are skipped, and weights never overwrite one already logged here.
export async function importFatSecretMonth(userId: string, month: string): Promise<MonthImportResult> {
  const client = apiDeps().fatSecret;
  const access = await fatSecretAccess(userId);
  const profile = await prisma.userProfile.findUnique({ select: { timezone: true }, where: { userId } });
  const timeZone = profile?.timezone ?? "UTC";
  const monthDate = fatSecretDateInt(`${month}-01`);

  const days = await client.monthDays(access, monthDate);
  const weights = await client.monthWeights(access, monthDate);
  const servingsByFood = new Map<string, Promise<FatSecretServing[] | null>>();
  const servingsFor = (foodId: string | undefined) => {
    if (!foodId) return Promise.resolve(null);
    if (!servingsByFood.has(foodId)) {
      servingsByFood.set(foodId, client.foodServings(foodId).catch(() => null));
    }
    return servingsByFood.get(foodId)!;
  };

  let entriesImported = 0;
  let daysImported = 0;
  let oldestDate = null as string | null;
  for (const dateInt of [...days].sort((a, b) => a - b)) {
    const entries = await client.dayEntries(access, dateInt);
    if (entries.length === 0) continue;
    const already = await prisma.externalImport.findMany({
      select: { externalId: true },
      where: { externalId: { in: entries.map((entry) => entry.food_entry_id) }, source: FATSECRET_SOURCE, userId },
    });
    const skip = new Set(already.map((row) => row.externalId));
    const fresh = entries.filter((entry) => !skip.has(entry.food_entry_id));
    const ymd = fatSecretYmd(dateInt);
    oldestDate = earlier(oldestDate, ymd);
    if (fresh.length === 0) continue;

    const byLabel = new Map<MealLabel, { ids: string[]; items: MealItemInput[] }>();
    for (const entry of fresh) {
      // Most entries carry their weight in the serving text ("1 porción, 250 ml"); only look the
      // food up when it doesn't ("2 large eggs"), which saves most of the calls.
      const servings = parseServingSize(entry.food_entry_description) ? null : await servingsFor(entry.food_id);
      const { item, label } = fatSecretEntryToItem(entry, servings);
      const group = byLabel.get(label) ?? { ids: [], items: [] };
      group.items.push(item);
      group.ids.push(entry.food_entry_id);
      byLabel.set(label, group);
    }
    for (const [label, group] of byLabel) {
      await upsertMealItems({ date: ymd, eatenAt: mealTime(ymd, label, timeZone), items: group.items, label, userId });
      await prisma.externalImport.createMany({
        data: group.ids.map((externalId) => ({ externalId, source: FATSECRET_SOURCE, userId })),
        skipDuplicates: true,
      });
    }
    entriesImported += fresh.length;
    daysImported += 1;
  }

  const weightRows = await prisma.weightEntry.createMany({
    data: weights.map((weight) => ({ date: fatSecretYmd(weight.dateInt), userId, weightKg: Math.round(weight.weightKg * 10) / 10 })),
    skipDuplicates: true,
  });
  for (const weight of weights) {
    oldestDate = earlier(oldestDate, fatSecretYmd(weight.dateInt));
  }

  const result = { days: daysImported, entries: entriesImported, month, oldestDate, weights: weightRows.count };
  await prisma.fatSecretConnection.update({
    data: {
      importedDays: { increment: result.days },
      importedEntries: { increment: result.entries },
      importedWeights: { increment: result.weights },
      importMonth: month,
      importMonthsDone: { increment: 1 },
      ...(oldestDate ? { importOldestDate: oldestDate } : {}),
    },
    where: { userId },
  });
  return result;
}

// Whether a month had anything at all in FatSecret (used to stop after a long empty stretch).
export function monthHadData(result: Pick<MonthImportResult, "oldestDate">): boolean {
  return result.oldestDate !== null;
}

export async function beginFatSecretImport(userId: string): Promise<string> {
  const now = apiDeps().now();
  await prisma.fatSecretConnection.update({
    data: {
      importError: null,
      importedDays: 0,
      importedEntries: 0,
      importedWeights: 0,
      importFinishedAt: null,
      importMonth: null,
      importMonthsDone: 0,
      importOldestDate: null,
      importStartedAt: now,
      importStatus: "running",
    },
    where: { userId },
  });
  return now.toISOString().slice(0, 7);
}

export function fatSecretReportText(counts: ImportCounts, locale: Locale = "en"): string {
  return pushCopy(locale).fatSecret.report(counts);
}

export async function finishFatSecretImport(userId: string, error?: string): Promise<void> {
  const updated = await prisma.fatSecretConnection.updateMany({
    data: { importError: error ?? null, importFinishedAt: apiDeps().now(), importStatus: error ? "failed" : "done" },
    where: { userId },
  });
  // Disconnected while importing: nothing to report.
  const connection = updated.count > 0 ? await prisma.fatSecretConnection.findUnique({ where: { userId } }) : null;
  if (!connection) return;
  const { fatSecret } = pushCopy(await userLocale(userId));
  const body = error
    ? fatSecret.failed
    : fatSecret.report({ days: connection.importedDays, entries: connection.importedEntries, weights: connection.importedWeights });
  await pushToUser(userId, { body, data: { type: "fatsecret_import" }, title: error ? fatSecret.failedTitle : fatSecret.done });
}

// Runs the whole import in this process (tests and scripts); production runs it as a workflow.
export async function runFatSecretImportInline(userId: string): Promise<void> {
  const currentMonth = await beginFatSecretImport(userId);
  let empty = 0;
  try {
    for (let offset = 0; offset < FATSECRET_MAX_MONTHS && empty < FATSECRET_EMPTY_MONTHS_TO_STOP; offset += 1) {
      const result = await importFatSecretMonth(userId, monthBefore(currentMonth, offset));
      empty = monthHadData(result) ? 0 : empty + 1;
    }
  } catch (error) {
    await finishFatSecretImport(userId, error instanceof Error ? error.message : String(error));
    return;
  }
  await finishFatSecretImport(userId);
}
