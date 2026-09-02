import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MealView } from "./meals.ts";
import { emptyNutrients } from "./nutrition.ts";
import { groupMealsByLabel } from "./meal-groups.ts";

function meal(input: {
  eatenAt: string;
  id: string;
  items: MealView["items"];
  label: MealView["label"];
}): MealView {
  return {
    eatenAt: input.eatenAt,
    id: input.id,
    incomplete: [],
    items: input.items,
    label: input.label,
    totals: emptyNutrients(),
  };
}

function item(input: {
  amount: number;
  energyKcal: number;
  fat: number;
  id: string;
  name: string;
  proteins: number;
}): MealView["items"][number] {
  return {
    amount: input.amount,
    barcode: null,
    grams: input.amount,
    id: input.id,
    incomplete: [],
    metrics: {
      ...emptyNutrients(),
      carbohydrates: 10,
      energyKcal: input.energyKcal,
      fat: input.fat,
      proteins: input.proteins,
    },
    name: input.name,
    unit: "g",
  };
}

describe("groupMealsByLabel", () => {
  it("combines meals of the same label and preserves item order", () => {
    const grouped = groupMealsByLabel([
      meal({
        eatenAt: "2026-09-02T08:00:00.000Z",
        id: "b1",
        items: [
          item({ amount: 50, energyKcal: 80, fat: 1, id: "i1", name: "Oats", proteins: 3 }),
        ],
        label: "breakfast",
      }),
      meal({
        eatenAt: "2026-09-02T12:00:00.000Z",
        id: "l1",
        items: [
          item({ amount: 200, energyKcal: 400, fat: 12, id: "i2", name: "Chicken", proteins: 40 }),
        ],
        label: "lunch",
      }),
      meal({
        eatenAt: "2026-09-02T09:00:00.000Z",
        id: "b2",
        items: [
          item({ amount: 100, energyKcal: 60, fat: 0, id: "i3", name: "Apple", proteins: 0 }),
        ],
        label: "breakfast",
      }),
    ]);
    assert.deepEqual(
      grouped.map((group) => group.label),
      ["breakfast", "lunch"],
    );
    assert.deepEqual(
      grouped[0]?.items.map((row) => row.id),
      ["i1", "i3"],
    );
    assert.equal(grouped[0]?.totals.energyKcal, 140);
    assert.equal(grouped[0]?.totals.fat, 1);
    assert.equal(grouped[0]?.totals.proteins, 3);
    assert.equal(grouped[1]?.totals.energyKcal, 400);
  });

  it("skips labels with no items", () => {
    const grouped = groupMealsByLabel([
      meal({ eatenAt: "2026-09-02T08:00:00.000Z", id: "empty", items: [], label: "dinner" }),
    ]);
    assert.deepEqual(grouped, []);
  });
});
