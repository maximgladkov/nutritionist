import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ServingSizeError,
  computeItemNutrition,
  emptyNutrients,
  hasPer100ml,
  incompleteNutrients,
  parseServingSize,
  scaleNutriments,
  sumNutrients,
} from "./nutrition.ts";

const yogurt = {
  energyKcal100g: 80,
  proteins100g: 4,
  carbohydrates100g: 10,
  sugars100g: 8,
  fat100g: 2,
  saturatedFat100g: 1,
  fiber100g: 0,
  salt100g: 0.1,
};

const juice = {
  energyKcal100ml: 45,
  proteins100ml: 0.2,
  carbohydrates100ml: 11,
  sugars100ml: 10,
  fat100ml: 0,
  saturatedFat100ml: 0,
  fiber100ml: 0,
  salt100ml: 0,
};

describe("parseServingSize", () => {
  it("parses grams with or without a space", () => {
    assert.deepEqual(parseServingSize("15 g"), { amount: 15, unit: "g" });
    assert.deepEqual(parseServingSize("15g"), { amount: 15, unit: "g" });
  });

  it("parses milliliters and liters", () => {
    assert.deepEqual(parseServingSize("30 ml"), { amount: 30, unit: "ml" });
    assert.deepEqual(parseServingSize("0.25 l"), { amount: 250, unit: "ml" });
    assert.deepEqual(parseServingSize("2 cl"), { amount: 20, unit: "ml" });
  });

  it("uses the last quantity in strings like 1 cookie (25 g)", () => {
    assert.deepEqual(parseServingSize("1 cookie (25 g)"), { amount: 25, unit: "g" });
  });

  it("returns null when unparseable", () => {
    assert.equal(parseServingSize("1 cookie"), null);
    assert.equal(parseServingSize(""), null);
    assert.equal(parseServingSize(null), null);
  });
});

describe("computeItemNutrition", () => {
  it("scales per 100g for grams", () => {
    const result = computeItemNutrition({
      amount: 50,
      unit: "g",
      nutriments: yogurt,
    });
    assert.equal(result.grams, 50);
    assert.equal(result.metrics.energyKcal, 40);
    assert.equal(result.metrics.proteins, 2);
  });

  it("leaves missing nutrients null", () => {
    const result = computeItemNutrition({
      amount: 100,
      unit: "g",
      nutriments: { energyKcal100g: 200 },
    });
    assert.equal(result.metrics.energyKcal, 200);
    assert.equal(result.metrics.proteins, null);
    assert.equal(result.metrics.fiber, null);
  });

  it("uses per 100ml when unit is ml and those fields exist", () => {
    const result = computeItemNutrition({
      amount: 250,
      unit: "ml",
      nutriments: juice,
    });
    assert.equal(result.grams, 250);
    assert.equal(result.metrics.energyKcal, 112.5);
    assert.equal(result.metrics.sugars, 25);
  });

  it("treats ml as grams when 100ml nutriments are missing", () => {
    const result = computeItemNutrition({
      amount: 100,
      unit: "ml",
      nutriments: yogurt,
    });
    assert.equal(result.metrics.energyKcal, 80);
    assert.equal(result.metrics.proteins, 4);
  });

  it("multiplies servings by parsed serving size", () => {
    const result = computeItemNutrition({
      amount: 2,
      unit: "serving",
      servingSize: "15 g",
      nutriments: yogurt,
    });
    assert.equal(result.grams, 30);
    assert.equal(result.metrics.energyKcal, 24);
  });

  it("throws when serving size cannot be parsed", () => {
    assert.throws(
      () =>
        computeItemNutrition({
          amount: 1,
          unit: "serving",
          servingSize: "1 cookie",
          nutriments: yogurt,
        }),
      ServingSizeError,
    );
  });
});

describe("scaleNutriments and sumNutrients", () => {
  it("sums only present values and reports incomplete keys", () => {
    const a = scaleNutriments({ energyKcal100g: 100, proteins100g: 10 }, 100, "g");
    const b = scaleNutriments({ energyKcal100g: 50 }, 100, "g");
    const totals = sumNutrients([a, b]);
    const incomplete = incompleteNutrients([a, b]);
    assert.equal(totals.energyKcal, 150);
    assert.equal(totals.proteins, 10);
    assert.ok(incomplete.includes("proteins"));
    assert.ok(!incomplete.includes("energyKcal"));
  });

  it("treats an empty list as fully incomplete", () => {
    assert.equal(incompleteNutrients([]).length, 8);
    assert.deepEqual(sumNutrients([]), emptyNutrients());
  });
});

describe("hasPer100ml", () => {
  it("is true when any 100ml field is present", () => {
    assert.equal(hasPer100ml(juice), true);
    assert.equal(hasPer100ml(yogurt), false);
  });
});
