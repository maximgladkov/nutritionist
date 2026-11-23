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
  it("puts products with the searched words above fuzzy lookalikes with shorter names", () => {
    const ranked = rankSearchProducts(
      [
        { brands: "Aranca", hasNutrition: true, name: "Habitas", nutriments: { energyKcal100g: 257 } },
        { brands: "aranca", hasNutrition: true, name: "Habas baby", nutriments: { energyKcal100g: 71 } },
        { brands: "Hacendado", hasNutrition: true, name: "Barritas arándanos", nutriments: { energyKcal100g: 345 } },
        { brands: "Hacendado", hasNutrition: true, name: "Arándanos enteros", nutriments: { energyKcal100g: 52 } },
      ],
      ["arandanos hac"],
    );
    assert.deepEqual(
      ranked.map((product) => product.name),
      ["Arándanos enteros", "Barritas arándanos", "Habitas", "Habas baby"],
    );
  });

  it("shows a name that has the searched words when the usual one has none", () => {
    const ranked = rankSearchProducts(
      [
        {
          brands: "Hacendado",
          hasNutrition: true,
          name: "Cheesecake",
          names: ["Cheesecake", "Cheesecake con arándanos"],
          nutriments: { energyKcal100g: 236 },
        },
        {
          brands: "Hacendado",
          hasNutrition: true,
          name: "Arándanos enteros",
          names: ["Arándanos enteros", "Whole blueberries"],
          nutriments: { energyKcal100g: 52 },
        },
      ],
      ["arandanos hac"],
    );
    assert.deepEqual(
      ranked.map((product) => product.name),
      ["Arándanos enteros", "Cheesecake con arándanos"],
    );
    // The other names stay out of what's returned.
    assert.equal(ranked.some((product) => "names" in product), false);
  });

  it("keeps the usual name when it already has one of the searched words", () => {
    const [product] = rankSearchProducts(
      [{ hasNutrition: true, name: "Blueberry yogurt", names: ["Blueberry yogurt", "Yogur de arándanos"] }],
      ["blueberry"],
    );
    assert.equal(product?.name, "Blueberry yogurt");
  });

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
