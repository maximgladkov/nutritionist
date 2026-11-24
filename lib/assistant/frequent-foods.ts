import { prisma } from "../prisma.ts";
import type { AmountUnit } from "../nutrition.ts";

const LOOKBACK_MS = 60 * 24 * 60 * 60_000;

export type FrequentFood = {
  amount: number;
  barcode: string | null;
  kcal: number | null;
  name: string;
  nutrimentsPer100g: unknown;
  proteins: number | null;
  times: number;
  unit: AmountUnit;
};

// The foods someone logs most, with the amount they had last.
export async function frequentFoods(input: { limit: number; now: Date; userId: string }): Promise<FrequentFood[]> {
  const rows = await prisma.mealItem.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    where: { meal: { eatenAt: { gte: new Date(input.now.getTime() - LOOKBACK_MS) }, userId: input.userId } },
  });
  const byName = new Map<string, FrequentFood>();
  for (const row of rows) {
    const key = row.barcode ?? row.name.trim().toLowerCase();
    const known = byName.get(key);
    if (known) {
      known.times += 1;
      continue;
    }
    byName.set(key, {
      amount: row.amount,
      barcode: row.barcode,
      kcal: row.energyKcal,
      name: row.name,
      nutrimentsPer100g: row.nutrimentsPer100g,
      proteins: row.proteins,
      times: 1,
      unit: row.unit as AmountUnit,
    });
  }
  return [...byName.values()].sort((a, b) => b.times - a.times).slice(0, input.limit);
}
