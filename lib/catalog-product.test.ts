import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogNutrimentsHaveValues, mergeProductSearch, pickNutriments } from "./catalog-product-query.ts";
import type { Product } from "./open-food-facts.ts";

function product(barcode: string, name: string): Product {
  return {
    allergens: null,
    barcode,
    brands: null,
    countries: [],
    imageUrl: null,
    ingredients: null,
    name,
    novaGroup: null,
    nutriments: {},
    nutriscoreGrade: null,
    quantity: null,
    servingSize: null,
  };
}

describe("catalogNutrimentsHaveValues", () => {
  it("requires at least one finite nutrient", () => {
    assert.equal(catalogNutrimentsHaveValues({}), false);
    assert.equal(catalogNutrimentsHaveValues({ energyKcal100g: Number.NaN }), false);
    assert.equal(catalogNutrimentsHaveValues({ energyKcal100g: 42, proteins100g: 3 }), true);
  });
});

describe("pickNutriments", () => {
  it("keeps only finite nutrient numbers", () => {
    assert.deepEqual(
      pickNutriments({
        energyKcal100g: 42,
        proteins100g: Number.NaN,
        name: "skip",
      }),
      { energyKcal100g: 42 },
    );
  });
});

describe("mergeProductSearch", () => {
  it("prepends catalog hits that Open Food Facts does not have", () => {
    const local = [product("111", "Local Soy"), product("222", "Dup")];
    const merged = mergeProductSearch(local, {
      count: 1,
      page: 1,
      products: [product("222", "Off Dup")],
    });
    assert.equal(merged.count, 2);
    assert.deepEqual(
      merged.products.map((item) => item.barcode),
      ["111", "222"],
    );
    assert.equal(merged.products[1]?.name, "Off Dup");
  });
});
