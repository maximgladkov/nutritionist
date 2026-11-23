import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foldSearchText, rankSearchProducts } from "./product-search.ts";

describe("foldSearchText", () => {
  it("folds case and accents", () => {
    assert.equal(foldSearchText("  Plátano  "), "platano");
    assert.equal(foldSearchText("Banana"), "banana");
  });
});

describe("rankSearchProducts", () => {
  it("ranks an exact banana with nutrition above parfait and empty produce", () => {
    const ranked = rankSearchProducts(
      [
        { hasNutrition: true, name: "Banana parfait" },
        { hasNutrition: false, name: "Banana" },
        { hasNutrition: true, name: "Banana" },
        { hasNutrition: true, name: "Banana chips" },
      ],
      ["banana"],
    );
    // The two unbranded "Banana" entries collapse into the one with nutrition.
    assert.deepEqual(
      ranked.map((product) => product.name),
      ["Banana", "Banana chips", "Banana parfait"],
    );
    assert.equal(ranked[0]?.hasNutrition, true);
  });

  it("keeps one of many unbranded same-name entries and lifts branded ones that start with the search", () => {
    const ranked = rankSearchProducts(
      [
        { hasNutrition: true, name: "Arandanos", nutriments: { energyKcal100g: 57 } },
        { hasNutrition: true, name: "Arándanos", nutriments: { energyKcal100g: 342 } },
        { hasNutrition: true, name: "Arandanos", nutriments: { energyKcal100g: 0 } },
        { brands: "Hacendado", countries: ["es"], hasNutrition: true, name: "Mermelada Arándanos", nutriments: { energyKcal100g: 88 } },
        { brands: "Hacendado", countries: ["es"], hasNutrition: true, name: "Arándanos enteros", nutriments: { energyKcal100g: 52 } },
      ],
      ["arandanos"],
      "es",
    );
    assert.deepEqual(
      ranked.map((product) => `${product.name}|${product.brands ?? ""}`),
      ["Arandanos|", "Arándanos enteros|Hacendado", "Mermelada Arándanos|Hacendado"],
    );
  });

  it("ranks exact banana above mineral water after a multilingual merge", () => {
    const ranked = rankSearchProducts(
      [
        { hasNutrition: true, name: "Agua mineral natural" },
        { hasNutrition: true, name: "Banana parfait" },
        { hasNutrition: true, name: "Banana" },
      ],
      ["банан", "banana", "plátano"],
    );
    assert.equal(ranked[0]?.name, "Banana");
    assert.equal(ranked[1]?.name, "Banana parfait");
    assert.equal(ranked[2]?.name, "Agua mineral natural");
  });

  it("treats accented catalog names as exact matches", () => {
    const ranked = rankSearchProducts(
      [
        { hasNutrition: true, name: "Yogur sabor a plátano" },
        { hasNutrition: true, name: "Plátano" },
      ],
      ["platano"],
    );
    assert.equal(ranked[0]?.name, "Plátano");
  });
});
