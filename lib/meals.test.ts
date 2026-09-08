import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cloneMealItemCreateData,
  copyMealSlots,
  eatenAtForCreate,
  MealError,
  mealQueryRange,
  mealWriteRange,
  scaleMealItemNutrition,
  todaysMealWrite,
} from "./meals.ts";
import { emptyNutrients } from "./nutrition.ts";
import { localDayRange, localInclusiveDateRange } from "./timezone.ts";

describe("todaysMealWrite", () => {
  it("appends when a meal for that label already exists today", () => {
    assert.deepEqual(todaysMealWrite("meal_1"), { action: "append", mealId: "meal_1" });
  });

  it("creates a new meal when none exists today", () => {
    assert.deepEqual(todaysMealWrite(null), { action: "create" });
    assert.deepEqual(todaysMealWrite(undefined), { action: "create" });
  });
});

describe("mealWriteRange", () => {
  it("uses today's nutrition day when date is omitted", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    assert.deepEqual(mealWriteRange({ now, timeZone: "UTC" }), localDayRange(now, "UTC"));
    assert.deepEqual(
      mealWriteRange({ now, timeZone: "Europe/Berlin" }),
      localDayRange(now, "Europe/Berlin"),
    );
  });

  it("uses an explicit YYYY-MM-DD nutrition day", () => {
    assert.deepEqual(
      mealWriteRange({ date: "2026-09-05", timeZone: "Europe/Berlin" }),
      localInclusiveDateRange("Europe/Berlin", "2026-09-05", "2026-09-05"),
    );
  });

  it("rejects an invalid date", () => {
    assert.throws(
      () => mealWriteRange({ date: "2026-02-30", timeZone: "UTC" }),
      (error: unknown) => error instanceof MealError,
    );
  });
});

describe("eatenAtForCreate", () => {
  const range = localDayRange(new Date("2026-09-06T12:00:00.000Z"), "UTC");

  it("keeps eatenAt when it falls in the nutrition day", () => {
    const eatenAt = new Date("2026-09-06T11:00:00.000Z");
    assert.equal(eatenAtForCreate(eatenAt, new Date("2026-09-06T15:00:00.000Z"), range), eatenAt);
  });

  it("clamps to the start of the day when eatenAt is outside the range", () => {
    assert.deepEqual(
      eatenAtForCreate(new Date("2026-09-05T11:00:00.000Z"), new Date("2026-09-06T15:00:00.000Z"), range),
      range.from,
    );
  });
});

describe("mealQueryRange", () => {
  it("uses today's nutrition day when from and to are omitted", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    assert.deepEqual(mealQueryRange({ now, timeZone: "UTC" }), localDayRange(now, "UTC"));
  });

  it("treats a single from date as that nutrition day", () => {
    assert.deepEqual(
      mealQueryRange({ from: "2026-08-01", timeZone: "Europe/Berlin" }),
      localInclusiveDateRange("Europe/Berlin", "2026-08-01", "2026-08-01"),
    );
  });

  it("treats a single to date as that nutrition day", () => {
    assert.deepEqual(
      mealQueryRange({ to: "2026-08-03", timeZone: "UTC" }),
      localInclusiveDateRange("UTC", "2026-08-03", "2026-08-03"),
    );
  });

  it("keeps an inclusive multi-day range", () => {
    assert.deepEqual(
      mealQueryRange({ from: "2026-08-01", to: "2026-08-03", timeZone: "Europe/Berlin" }),
      localInclusiveDateRange("Europe/Berlin", "2026-08-01", "2026-08-03"),
    );
  });

  it("swaps reversed dates", () => {
    assert.deepEqual(
      mealQueryRange({ from: "2026-08-03", to: "2026-08-01", timeZone: "Europe/Berlin" }),
      localInclusiveDateRange("Europe/Berlin", "2026-08-01", "2026-08-03"),
    );
  });

  it("rejects invalid dates", () => {
    assert.throws(
      () => mealQueryRange({ from: "2026-02-30", timeZone: "UTC" }),
      (error: unknown) => error instanceof MealError,
    );
    assert.throws(
      () => mealQueryRange({ from: "2026-08-01T12:00:00Z", to: "2026-08-02", timeZone: "UTC" }),
      (error: unknown) => error instanceof MealError,
    );
  });
});

describe("scaleMealItemNutrition", () => {
  const yogurt = {
    carbohydrates: 10,
    energyKcal: 80,
    fat: 2,
    fiber: 0,
    proteins: 4,
    salt: 0.1,
    saturatedFat: 1,
    sugars: 8,
  };

  it("scales grams and nutrients by the amount ratio", () => {
    const result = scaleMealItemNutrition({
      amount: 100,
      grams: 100,
      metrics: yogurt,
      newAmount: 150,
    });
    assert.equal(result.amount, 150);
    assert.equal(result.grams, 150);
    assert.deepEqual(result.metrics, {
      carbohydrates: 15,
      energyKcal: 120,
      fat: 3,
      fiber: 0,
      proteins: 6,
      salt: 0.15,
      saturatedFat: 1.5,
      sugars: 12,
    });
  });

  it("scales milliliter amounts", () => {
    const result = scaleMealItemNutrition({
      amount: 200,
      grams: 200,
      metrics: { ...emptyNutrients(), energyKcal: 90, sugars: 20 },
      newAmount: 100,
    });
    assert.equal(result.grams, 100);
    assert.equal(result.metrics.energyKcal, 45);
    assert.equal(result.metrics.sugars, 10);
    assert.equal(result.metrics.proteins, null);
  });

  it("scales serving amounts using stored grams", () => {
    const result = scaleMealItemNutrition({
      amount: 1,
      grams: 25,
      metrics: { ...emptyNutrients(), energyKcal: 80, proteins: 3 },
      newAmount: 2,
    });
    assert.equal(result.amount, 2);
    assert.equal(result.grams, 50);
    assert.equal(result.metrics.energyKcal, 160);
    assert.equal(result.metrics.proteins, 6);
  });

  it("keeps null nutrients null", () => {
    const result = scaleMealItemNutrition({
      amount: 100,
      grams: 100,
      metrics: { ...emptyNutrients(), energyKcal: 200 },
      newAmount: 50,
    });
    assert.equal(result.metrics.energyKcal, 100);
    assert.equal(result.metrics.fat, null);
    assert.equal(result.metrics.fiber, null);
  });

  it("returns the original values when the amount is unchanged", () => {
    const result = scaleMealItemNutrition({
      amount: 80,
      grams: 80,
      metrics: yogurt,
      newAmount: 80,
    });
    assert.equal(result.amount, 80);
    assert.equal(result.grams, 80);
    assert.deepEqual(result.metrics, yogurt);
  });

  it("rejects non-positive and oversized amounts", () => {
    assert.throws(
      () =>
        scaleMealItemNutrition({
          amount: 100,
          grams: 100,
          metrics: emptyNutrients(),
          newAmount: 0,
        }),
      (error: unknown) => error instanceof MealError,
    );
    assert.throws(
      () =>
        scaleMealItemNutrition({
          amount: 100,
          grams: 100,
          metrics: emptyNutrients(),
          newAmount: 10001,
        }),
      (error: unknown) => error instanceof MealError,
    );
  });
});

describe("copyMealSlots", () => {
  it("copies onto today with the same label by default", () => {
    const now = new Date("2026-09-08T08:00:00.000Z");
    const plan = copyMealSlots({
      from: "2026-09-07",
      label: "breakfast",
      now,
      timeZone: "UTC",
    });
    assert.equal(plan.sameSlot, false);
    assert.equal(plan.sourceLabel, "breakfast");
    assert.equal(plan.targetLabel, "breakfast");
    assert.equal(plan.targetDate, "2026-09-08");
    assert.deepEqual(plan.sourceRange, mealWriteRange({ date: "2026-09-07", timeZone: "UTC" }));
    assert.deepEqual(plan.targetRange, mealWriteRange({ now, timeZone: "UTC" }));
  });

  it("uses asLabel when they want a different slot", () => {
    const plan = copyMealSlots({
      asLabel: "lunch",
      date: "2026-09-08",
      from: "2026-09-07",
      label: "breakfast",
      now: new Date("2026-09-08T15:00:00.000Z"),
      timeZone: "UTC",
    });
    assert.equal(plan.sameSlot, false);
    assert.equal(plan.targetLabel, "lunch");
    assert.equal(plan.targetDate, "2026-09-08");
  });

  it("treats the same day and label as a no-op", () => {
    const plan = copyMealSlots({
      date: "2026-09-07",
      from: "2026-09-07",
      label: "breakfast",
      now: new Date("2026-09-08T08:00:00.000Z"),
      timeZone: "UTC",
    });
    assert.equal(plan.sameSlot, true);
  });
});

describe("cloneMealItemCreateData", () => {
  it("copies stored item fields without an id", () => {
    const cloned = cloneMealItemCreateData({
      amount: 125,
      barcode: "8410000000001",
      carbohydrates: 12,
      energyKcal: 80,
      fat: 2,
      fiber: 0,
      grams: 125,
      imageUrl: "https://example.com/yogurt.jpg",
      name: "Yogurt",
      nutrimentsPer100g: { energyKcal100g: 64, proteins100g: 4 },
      proteins: 5,
      salt: 0.1,
      saturatedFat: 1,
      sugars: 8,
      unit: "g",
    });
    assert.deepEqual(cloned, {
      amount: 125,
      barcode: "8410000000001",
      carbohydrates: 12,
      energyKcal: 80,
      fat: 2,
      fiber: 0,
      grams: 125,
      imageUrl: "https://example.com/yogurt.jpg",
      name: "Yogurt",
      nutrimentsPer100g: { energyKcal100g: 64, proteins100g: 4 },
      proteins: 5,
      salt: 0.1,
      saturatedFat: 1,
      sugars: 8,
      unit: "g",
    });
  });

  it("uses an empty nutriments object when stored JSON is null", () => {
    const cloned = cloneMealItemCreateData({
      amount: 73,
      barcode: null,
      carbohydrates: null,
      energyKcal: 30,
      fat: null,
      fiber: null,
      grams: 73,
      imageUrl: null,
      name: "Milk",
      nutrimentsPer100g: null,
      proteins: null,
      salt: null,
      saturatedFat: null,
      sugars: null,
      unit: "ml",
    });
    assert.deepEqual(cloned.nutrimentsPer100g, {});
    assert.equal(cloned.barcode, null);
  });
});
