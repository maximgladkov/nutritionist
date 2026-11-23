import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// Imports USDA FoodData Central "SR Legacy": about 7,800 generic foods (a fried egg, white toast,
// brewed coffee) with per-100 g nutrition and household portions. Public domain (CC0). It's the
// final release, so the data never changes; reruns only fill what's missing.

export const USDA_SR_LEGACY_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip";
export const USDA_SOURCE = "usda-sr-legacy";

export type GenericFoodRow = {
  category: string | null;
  id: string;
  name: string;
  nutriments: Record<string, number>;
  portions: { grams: number; label: string }[];
  source: string;
  sourceId: string;
};

type UsdaNutrient = { amount?: number; nutrient?: { number?: string; unitName?: string } };
type UsdaPortion = { amount?: number; gramWeight?: number; measureUnit?: { name?: string }; modifier?: string };
export type UsdaFood = {
  description?: string;
  fdcId?: number;
  foodCategory?: { description?: string };
  foodNutrients?: UsdaNutrient[];
  foodPortions?: UsdaPortion[];
};

// USDA nutrient numbers → our per-100 g keys.
const NUTRIENTS: Record<string, string> = {
  "203": "proteins100g",
  "204": "fat100g",
  "205": "carbohydrates100g",
  "208": "energyKcal100g",
  "269": "sugars100g",
  "291": "fiber100g",
  "606": "saturatedFat100g",
};
const ENERGY_KJ = "268";
const SODIUM_MG = "307";
const KJ_PER_KCAL = 4.184;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function portionLabel(portion: UsdaPortion): string | null {
  const amount = portion.amount ?? 1;
  const unit = portion.measureUnit?.name && portion.measureUnit.name !== "undetermined" ? portion.measureUnit.name : "";
  const words = [unit, portion.modifier ?? ""].filter(Boolean).join(" ").trim();
  if (!words) return null;
  return `${Number.isInteger(amount) ? amount : round(amount)} ${words}`;
}

export function parseUsdaFood(food: UsdaFood): GenericFoodRow | null {
  const name = food.description?.trim();
  if (!food.fdcId || !name) return null;
  const nutriments: Record<string, number> = {};
  let energyKj: number | undefined;
  for (const entry of food.foodNutrients ?? []) {
    const number = entry.nutrient?.number;
    const amount = entry.amount;
    if (!number || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) continue;
    const key = NUTRIENTS[number];
    if (key) nutriments[key] = round(amount);
    else if (number === ENERGY_KJ) energyKj = amount;
    else if (number === SODIUM_MG) nutriments.salt100g = round((amount * 2.5) / 1000);
  }
  if (nutriments.energyKcal100g === undefined && energyKj !== undefined) {
    nutriments.energyKcal100g = round(energyKj / KJ_PER_KCAL);
  }
  // A food without calories can't stand in for anything.
  if (nutriments.energyKcal100g === undefined) return null;
  const portions = (food.foodPortions ?? []).flatMap((portion) => {
    const label = portionLabel(portion);
    const grams = portion.gramWeight;
    return label && typeof grams === "number" && grams > 0 ? [{ grams: round(grams), label }] : [];
  });
  const sourceId = String(food.fdcId);
  return {
    category: food.foodCategory?.description?.trim() || null,
    id: `usda:${sourceId}`,
    name,
    nutriments,
    portions,
    source: USDA_SOURCE,
    sourceId,
  };
}

type Query = (sql: string, params: unknown[]) => Promise<unknown>;

const BATCH = 500;

export async function upsertGenericFoods(query: Query, rows: readonly GenericFoodRow[]): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    await query(
      `INSERT INTO "GenericFood" ("id", "source", "sourceId", "name", "category", "nutriments", "portions", "updatedAt")
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::jsonb[], $7::jsonb[])
         AS t(id, source, "sourceId", name, category, nutriments, portions), LATERAL (SELECT NOW()) AS n("updatedAt")
       ON CONFLICT ("id") DO UPDATE SET
         "name" = EXCLUDED."name",
         "category" = EXCLUDED."category",
         "nutriments" = EXCLUDED."nutriments",
         "portions" = EXCLUDED."portions",
         -- A renamed food is embedded again by the next embedding pass.
         "embedding" = CASE WHEN "GenericFood"."name" IS DISTINCT FROM EXCLUDED."name" THEN NULL ELSE "GenericFood"."embedding" END,
         "updatedAt" = NOW()`,
      [
        batch.map((row) => row.id),
        batch.map((row) => row.source),
        batch.map((row) => row.sourceId),
        batch.map((row) => row.name),
        batch.map((row) => row.category),
        batch.map((row) => JSON.stringify(row.nutriments)),
        batch.map((row) => JSON.stringify(row.portions)),
      ],
    );
  }
}

const run = promisify(execFile);

// Downloads and unpacks the dataset (the JSON is about 200 MB) into a throwaway folder.
export async function downloadUsdaFoods(log: (message: string) => void = () => undefined): Promise<UsdaFood[]> {
  const folder = await mkdtemp(join(tmpdir(), "usda-"));
  try {
    log(`Downloading ${USDA_SR_LEGACY_URL}`);
    const response = await fetch(USDA_SR_LEGACY_URL);
    if (!response.ok) throw new Error(`USDA download failed (${response.status})`);
    const zip = join(folder, "foods.zip");
    await writeFile(zip, Buffer.from(await response.arrayBuffer()));
    await run("unzip", ["-q", "-o", zip, "-d", folder]);
    const file = (await readdir(folder)).find((name) => name.endsWith(".json"));
    if (!file) throw new Error("The USDA archive has no JSON file.");
    log("Parsing foods...");
    const data = JSON.parse(await readFile(join(folder, file), "utf8")) as { SRLegacyFoods?: UsdaFood[] };
    return data.SRLegacyFoods ?? [];
  } finally {
    await rm(folder, { force: true, recursive: true });
  }
}
