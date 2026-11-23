import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUsdaFood } from "./usda-import.ts";

const nutrient = (number: string, amount: number) => ({ amount, nutrient: { number } });

describe("parseUsdaFood", () => {
  it("maps nutrients per 100 g, sodium to salt and portions", () => {
    const row = parseUsdaFood({
      description: "Egg, whole, cooked, fried",
      fdcId: 173423,
      foodCategory: { description: "Dairy and Egg Products" },
      foodNutrients: [nutrient("208", 196), nutrient("203", 13.6), nutrient("204", 14.84), nutrient("307", 207), nutrient("606", 4.32)],
      foodPortions: [{ amount: 1, gramWeight: 46, modifier: "large" }, { amount: 1, gramWeight: 0, modifier: "broken" }],
    });
    assert.deepEqual(row, {
      category: "Dairy and Egg Products",
      id: "usda:173423",
      name: "Egg, whole, cooked, fried",
      nutriments: { energyKcal100g: 196, fat100g: 14.84, proteins100g: 13.6, salt100g: 0.52, saturatedFat100g: 4.32 },
      portions: [{ grams: 46, label: "1 large" }],
      source: "usda-sr-legacy",
      sourceId: "173423",
    });
  });

  it("falls back to kilojoules and skips foods without energy", () => {
    assert.equal(parseUsdaFood({ description: "Water", fdcId: 1, foodNutrients: [nutrient("268", 418.4)] })?.nutriments.energyKcal100g, 100);
    assert.equal(parseUsdaFood({ description: "Mystery", fdcId: 2, foodNutrients: [nutrient("203", 1)] }), null);
  });

  it("labels portions with their unit", () => {
    const row = parseUsdaFood({
      description: "Coffee, brewed",
      fdcId: 3,
      foodNutrients: [nutrient("208", 1)],
      foodPortions: [{ amount: 1, gramWeight: 237, measureUnit: { name: "cup" }, modifier: "(8 fl oz)" }],
    });
    assert.deepEqual(row?.portions, [{ grams: 237, label: "1 cup (8 fl oz)" }]);
  });
});
