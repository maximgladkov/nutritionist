import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogNutrimentsHaveValues,
  decideCatalogSave,
  mergeCatalogSearchResults,
  mergeProductSearch,
  pickNutriments,
  preferProduct,
  resolveCatalogBarcode,
} from "./catalog-product-query.ts";
import type { Product } from "./open-food-facts.ts";

function product(barcode: string | null, name: string, nutriments: Product["nutriments"] = {}): Product {
  return {
    allergens: null,
    barcode,
    brands: null,
    countries: [],
    imageUrl: null,
    ingredients: null,
    name,
    novaGroup: null,
    nutriments,
    nutriscoreGrade: null,
    quantity: null,
    servingSize: null,
  };
}

describe("resolveCatalogBarcode", () => {
  it("keeps a valid GTIN", () => {
    assert.deepEqual(resolveCatalogBarcode("3017624010701"), {
      barcode: "3017624010701",
      ignored: false,
    });
  });

  it("omits a missing barcode", () => {
    assert.deepEqual(resolveCatalogBarcode(undefined), { barcode: null, ignored: false });
    assert.deepEqual(resolveCatalogBarcode("  "), { barcode: null, ignored: false });
  });

  it("ignores invented or invalid barcodes instead of saving them", () => {
    assert.deepEqual(resolveCatalogBarcode("MILSANI001"), { barcode: null, ignored: true });
    assert.deepEqual(resolveCatalogBarcode("843670100001"), { barcode: null, ignored: true });
  });
});

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

describe("preferProduct", () => {
  it("prefers a custom catalog product that has nutrition", () => {
    const catalog = product("111", "Custom", { energyKcal100g: 10 });
    const off = product("111", "Off", { energyKcal100g: 20 });
    assert.deepEqual(preferProduct(catalog, off), { product: catalog, source: "custom-catalog" });
  });

  it("uses Open Food Facts when the custom catalog has no nutrition", () => {
    const catalog = product("111", "Custom");
    const off = product("111", "Off", { energyKcal100g: 20 });
    assert.deepEqual(preferProduct(catalog, off), { product: off, source: "open-food-facts" });
  });

  it("falls back to the custom catalog when neither has nutrition", () => {
    const catalog = product("111", "Custom");
    const off = product("111", "Off");
    assert.deepEqual(preferProduct(catalog, off), { product: catalog, source: "custom-catalog" });
  });

  it("returns undefined when neither source has the product", () => {
    assert.equal(preferProduct(undefined, undefined), undefined);
  });
});

describe("decideCatalogSave", () => {
  it("does not overwrite a custom catalog product that already has nutrition", () => {
    const catalog = product("111", "Custom", { energyKcal100g: 10 });
    assert.deepEqual(decideCatalogSave(catalog, product("111", "Off")), {
      action: "exists",
      product: catalog,
      source: "custom-catalog",
    });
  });

  it("updates a custom catalog product that has no nutrition", () => {
    const catalog = product("111", "Custom");
    assert.deepEqual(decideCatalogSave(catalog, product("111", "Off", { energyKcal100g: 20 })), {
      action: "update",
      product: catalog,
    });
  });

  it("skips saving when Open Food Facts already has nutrition", () => {
    const off = product("111", "Off", { energyKcal100g: 20 });
    assert.deepEqual(decideCatalogSave(undefined, off), {
      action: "exists",
      product: off,
      source: "open-food-facts",
    });
  });

  it("creates a custom catalog product when Open Food Facts has no nutrition", () => {
    assert.deepEqual(decideCatalogSave(undefined, product("111", "Off")), { action: "create" });
  });
});

describe("mergeProductSearch", () => {
  it("lists custom catalog hits first and prefers them over Open Food Facts for the same barcode", () => {
    const local = [product("111", "Local Soy"), product("222", "Local Dup", { energyKcal100g: 5 })];
    const merged = mergeProductSearch(local, {
      count: 1,
      page: 1,
      products: [product("222", "Off Dup", { energyKcal100g: 9 })],
    });
    assert.equal(merged.count, 2);
    assert.deepEqual(
      merged.products.map((item) => ({ barcode: item.barcode, name: item.name, source: item.source })),
      [
        { barcode: "111", name: "Local Soy", source: "custom-catalog" },
        { barcode: "222", name: "Local Dup", source: "custom-catalog" },
      ],
    );
    assert.equal(merged.products[0]?.hasNutrition, false);
    assert.equal(merged.products[1]?.hasNutrition, true);
  });

  it("keeps Open Food Facts when the custom catalog hit has no nutrition", () => {
    const merged = mergeProductSearch([product("222", "Local Dup")], {
      count: 1,
      page: 1,
      products: [product("222", "Off Dup", { proteins100g: 3 })],
    });
    assert.equal(merged.products[0]?.name, "Off Dup");
    assert.equal(merged.products[0]?.source, "open-food-facts");
    assert.equal(merged.products[0]?.hasNutrition, true);
  });

  it("keeps custom catalog products that have no barcode", () => {
    const merged = mergeProductSearch([product(null, "Milsani Yogur", { energyKcal100g: 51 })], {
      count: 0,
      page: 1,
      products: [],
    });
    assert.equal(merged.count, 1);
    assert.equal(merged.products[0]?.barcode, null);
    assert.equal(merged.products[0]?.name, "Milsani Yogur");
    assert.equal(merged.products[0]?.source, "custom-catalog");
  });
});

describe("mergeCatalogSearchResults", () => {
  it("dedupes barcodes and prefers custom catalog nutrition", () => {
    const merged = mergeCatalogSearchResults([
      {
        count: 1,
        page: 1,
        products: [{ ...product("111", "Off Yogurt", { energyKcal100g: 80 }), hasNutrition: true, source: "open-food-facts" }],
      },
      {
        count: 1,
        page: 1,
        products: [{ ...product("111", "My Yogurt", { energyKcal100g: 90 }), hasNutrition: true, source: "custom-catalog" }],
      },
    ]);
    assert.equal(merged.count, 1);
    assert.equal(merged.products[0]?.name, "My Yogurt");
    assert.equal(merged.products[0]?.source, "custom-catalog");
  });
});
