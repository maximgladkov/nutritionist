import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { listCountries, normalizeCountryCode, toOpenFoodFactsCountry } from "./countries.ts";
import {
  getProductByBarcode,
  InvalidBarcodeError,
  offCatalog,
  searchProductsByName,
} from "./open-food-facts.ts";
import type { Product } from "./open-food-facts-map.ts";

function product(name: string, barcode = "3017624010701"): Product {
  return {
    allergens: null,
    barcode,
    brands: "Ferrero",
    countries: ["fr"],
    imageUrl: "https://example.com/nutella-small.jpg",
    ingredients: "Sugar, palm oil",
    name,
    novaGroup: 4,
    nutriments: { energyKcal100g: 539 },
    nutriscoreGrade: "e",
    quantity: "400 g",
    servingSize: "15 g",
  };
}

describe("normalizeCountryCode", () => {
  it("lowercases and trims ISO alpha-2 codes", () => {
    assert.equal(normalizeCountryCode(" US "), "us");
    assert.equal(normalizeCountryCode("fr"), "fr");
  });

  it("rejects non-ISO values", () => {
    assert.equal(normalizeCountryCode("usa"), null);
    assert.equal(normalizeCountryCode("u"), null);
    assert.equal(normalizeCountryCode(""), null);
  });
});

describe("toOpenFoodFactsCountry", () => {
  it("maps gb to uk", () => {
    assert.equal(toOpenFoodFactsCountry("gb"), "uk");
    assert.equal(toOpenFoodFactsCountry("GB"), "uk");
  });

  it("leaves other codes unchanged", () => {
    assert.equal(toOpenFoodFactsCountry("us"), "us");
  });
});

describe("listCountries", () => {
  it("includes common countries with display names", () => {
    const countries = listCountries();
    const us = countries.find((country) => country.code === "us");
    const fr = countries.find((country) => country.code === "fr");
    assert.equal(us?.name, "United States");
    assert.equal(fr?.name, "France");
    assert.ok(countries.every((country) => /^[a-z]{2}$/.test(country.code)));
  });
});

describe("getProductByBarcode", () => {
  const originalFind = offCatalog.findByBarcode;

  afterEach(() => {
    offCatalog.findByBarcode = originalFind;
    mock.restoreAll();
  });

  it("returns a local catalog hit without fetching", async () => {
    offCatalog.findByBarcode = async () => product("Nutella");
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      throw new Error("should not fetch");
    });
    const result = await getProductByBarcode("3017624010701", { country: "us" });
    assert.equal(result.found, true);
    if (!result.found) {
      return;
    }
    assert.equal(result.product.name, "Nutella");
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it("returns not found on a local miss without fetching", async () => {
    offCatalog.findByBarcode = async () => null;
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      throw new Error("should not fetch");
    });
    const result = await getProductByBarcode("00000000");
    assert.deepEqual(result, { found: false, barcode: "00000000" });
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it("rejects invalid barcodes without fetching", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      throw new Error("should not fetch");
    });
    await assert.rejects(() => getProductByBarcode("abc"), InvalidBarcodeError);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});

describe("searchProductsByName", () => {
  const originalSearch = offCatalog.searchByName;

  afterEach(() => {
    offCatalog.searchByName = originalSearch;
    mock.restoreAll();
  });

  it("searches the local catalog and does not fetch", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      throw new Error("should not fetch");
    });
    offCatalog.searchByName = async (query, options) => {
      assert.equal(query, "Wasa Vitalité Kaura");
      assert.equal(options.country, "fr");
      assert.equal(options.pageSize, 10);
      return [
        {
          allergens: null,
          barcode: "7300400481595",
          brands: "Wasa",
          countries: ["fr"],
          imageUrl: null,
          ingredients: null,
          name: "Vitalité Kaura",
          novaGroup: null,
          nutriments: {},
          nutriscoreGrade: null,
          quantity: null,
          servingSize: null,
        },
      ];
    };

    const result = await searchProductsByName("Wasa Vitalité Kaura", { country: "fr" });
    assert.equal(result.count, 1);
    assert.equal(result.products[0]?.name, "Vitalité Kaura");
    assert.equal(result.products[0]?.brands, "Wasa");
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it("returns an empty page for blank queries", async () => {
    offCatalog.searchByName = async () => {
      throw new Error("should not search");
    };
    const result = await searchProductsByName("   ");
    assert.deepEqual(result, { count: 0, page: 1, products: [] });
  });
});
