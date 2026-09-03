import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { listCountries, normalizeCountryCode, toOpenFoodFactsCountry } from "./countries.ts";
import {
  getProductByBarcode,
  InvalidBarcodeError,
  searchProductsByName,
} from "./open-food-facts.ts";

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
  const previousFrom = process.env.AUTH_EMAIL_FROM;

  afterEach(() => {
    mock.restoreAll();
    if (previousFrom === undefined) {
      delete process.env.AUTH_EMAIL_FROM;
    } else {
      process.env.AUTH_EMAIL_FROM = previousFrom;
    }
  });

  it("requests selected fields with User-Agent and cc", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async (input: URL | RequestInfo) => {
      const url = String(input);
      assert.match(url, /\/api\/v3\/product\/3017624010701/);
      assert.match(url, /fields=/);
      assert.match(url, /[?&]cc=us(?:&|$)/);
      return jsonResponse({
        product: {
          code: "3017624010701",
          product_name: "Nutella",
          brands: "Ferrero",
          quantity: "400 g",
          serving_size: "15 g",
          nutriscore_grade: "e",
          nova_group: 4,
          ingredients_text: "Sugar, palm oil",
          allergens: "en:milk,en:soybeans",
          nutriments: {
            "energy-kcal_100g": 539,
            proteins_100g: 6.3,
            carbohydrates_100g: 57.5,
            sugars_100g: 56.3,
            fat_100g: 30.9,
            "saturated-fat_100g": 10.6,
            fiber_100g: 0,
            salt_100g: 0.107,
            "energy-kcal_100ml": 539,
            proteins_100ml: 6.3,
          },
          image_url: "https://example.com/nutella.jpg",
          countries_tags: ["en:france"],
        },
      });
    });

    process.env.AUTH_EMAIL_FROM = "BTR.me <hello@example.com>";
    const result = await getProductByBarcode("3017624010701", { country: "us" });

    assert.equal(result.found, true);
    if (!result.found) {
      return;
    }
    assert.equal(result.product.name, "Nutella");
    assert.equal(result.product.nutriments.energyKcal100g, 539);
    assert.equal(result.product.nutriments.energyKcal100ml, 539);
    assert.equal(result.product.nutriments.proteins100ml, 6.3);
    assert.equal(result.product.nutriments.saturatedFat100g, 10.6);
    assert.deepEqual(result.product.countries, ["en:france"]);
    assert.equal(fetchMock.mock.callCount(), 1);
    const [, init] = fetchMock.mock.calls[0]?.arguments ?? [];
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("User-Agent"), "BTR.me/0.0.0 (hello@example.com)");
  });

  it("maps gb to uk in cc", async () => {
    mock.method(globalThis, "fetch", async (input: URL | RequestInfo) => {
      assert.match(String(input), /[?&]cc=uk(?:&|$)/);
      return jsonResponse({ product: { code: "12345678", product_name: "Tea" } });
    });
    const result = await getProductByBarcode("12345678", { country: "gb" });
    assert.equal(result.found, true);
  });

  it("falls back to a localized product name when product_name is empty", async () => {
    mock.method(globalThis, "fetch", async () =>
      jsonResponse({
        product: {
          code: "7622210103253",
          product_name: "",
          product_name_en: "PHILADELPHIA LIGHT",
          product_name_es: "Philadelphia Light",
        },
      }),
    );
    const result = await getProductByBarcode("7622210103253", { country: "es" });
    assert.equal(result.found, true);
    if (!result.found) {
      return;
    }
    assert.equal(result.product.name, "Philadelphia Light");
  });

  it("returns not found on 404", async () => {
    mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
    const result = await getProductByBarcode("00000000");
    assert.deepEqual(result, { found: false, barcode: "00000000" });
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
  afterEach(() => {
    mock.restoreAll();
  });

  it("sends CGI search params and country tags", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/cgi/search.pl");
      assert.equal(url.searchParams.get("search_terms"), "oat milk");
      assert.equal(url.searchParams.get("search_simple"), "1");
      assert.equal(url.searchParams.get("action"), "process");
      assert.equal(url.searchParams.get("json"), "1");
      assert.equal(url.searchParams.get("page_size"), "10");
      assert.equal(url.searchParams.get("cc"), "us");
      assert.equal(url.searchParams.get("tagtype_0"), "countries");
      assert.equal(url.searchParams.get("tag_contains_0"), "contains");
      assert.equal(url.searchParams.get("tag_0"), "us");
      return jsonResponse({
        count: 1,
        page: 1,
        products: [{ code: "1", product_name: "Oatly" }],
      });
    });

    const result = await searchProductsByName("oat milk", { country: "us" });
    assert.equal(result.count, 1);
    assert.equal(result.products[0]?.name, "Oatly");
    assert.equal(fetchMock.mock.callCount(), 1);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
