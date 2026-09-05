import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countryTagToIso,
  countryTagsToIsoCodes,
  intersectCountryCodes,
  parseCountryList,
} from "./off-country.ts";
import { databaseHost, dedupeByBarcode, deltaFilesToApply, formatBytes, formatDuration } from "./off-import-run.ts";
import { buildSearchSource, extractLocalizedNames, slimOffDocument, stripNullBytes } from "./off-import.ts";
import { MIN_SEARCH_TOKEN_LENGTH, fuzzyTokenFilters, searchTokens } from "./product-search.ts";

describe("country tags", () => {
  it("maps Open Food Facts slugs and codes to ISO", () => {
    assert.equal(countryTagToIso("en:france"), "fr");
    assert.equal(countryTagToIso("en:united-states"), "us");
    assert.equal(countryTagToIso("en:united-kingdom"), "gb");
    assert.equal(countryTagToIso("en:uk"), "gb");
    assert.equal(countryTagToIso("en:es"), "es");
    assert.equal(countryTagToIso("en:eu"), null);
    assert.deepEqual(countryTagsToIsoCodes(["en:france", "en:united-states", "en:france"]), ["fr", "us"]);
  });

  it("parses allowlists and intersects product countries", () => {
    assert.deepEqual(parseCountryList(" US,gb, fr "), ["fr", "gb", "us"]);
    assert.deepEqual(intersectCountryCodes(["fr", "us", "es"], ["us", "gb"]), ["us"]);
    assert.deepEqual(intersectCountryCodes(["fr"], []), []);
  });
});

describe("slimOffDocument", () => {
  const wasa = {
    code: "7300400481595",
    product_name: "Vitalité Kaura",
    product_name_fr: "Vitalité Kaura complet",
    brands: "Wasa",
    quantity: "265 g",
    serving_size: "31 g",
    nutriscore_grade: "a",
    nova_group: 3,
    ingredients_text: "Wholegrain rye",
    allergens: "en:gluten",
    nutriments: { "energy-kcal_100g": 230, proteins_100g: 10 },
    image_small_url: "https://images.openfoodfacts.org/wasa.jpg",
    countries_tags: ["en:france", "en:sweden"],
    last_modified_t: 1700000000,
  };

  it("keeps slim fields for allowlisted countries and builds search source from name and brand", () => {
    const slim = slimOffDocument(wasa, ["fr"]);
    assert.ok(slim);
    assert.equal(slim.barcode, "7300400481595");
    assert.equal(slim.name, "Vitalité Kaura");
    assert.equal(slim.brands, "Wasa");
    assert.deepEqual(slim.countryCodes, ["fr"]);
    assert.equal(slim.nutriments.energyKcal100g, 230);
    assert.match(slim.searchSource, /Vitalité Kaura/);
    assert.match(slim.searchSource, /Wasa/);
    assert.equal(slim.lastModifiedAt?.toISOString(), new Date(1700000000 * 1000).toISOString());
  });

  it("skips products outside the allowlist, without a name, or with a bad barcode", () => {
    assert.equal(slimOffDocument(wasa, ["us"]), null);
    assert.equal(slimOffDocument({ ...wasa, product_name: "", product_name_fr: "" }, ["fr"]), null);
    assert.equal(slimOffDocument({ ...wasa, code: "abc" }, ["fr"]), null);
  });

  it("strips null bytes that Postgres cannot store in json/text", () => {
    assert.equal(stripNullBytes("alta qualit\u0000a"), "alta qualita");
    const slim = slimOffDocument(
      {
        ...wasa,
        product_name_en: "Prosciutto cotto alta qualit\u0000a",
      },
      ["fr"],
    );
    assert.ok(slim);
    assert.equal(slim.names.product_name_en, "Prosciutto cotto alta qualita");
    assert.equal(JSON.stringify(slim.names).includes("\\u0000"), false);
  });

  it("maps dump nutrition.aggregated_set when nutriments is empty", () => {
    const slim = slimOffDocument(
      {
        ...wasa,
        nutriments: {},
        nutrition: {
          aggregated_set: {
            per: "100g",
            nutrients: {
              "energy-kcal": { value: 230, unit: "kcal" },
              proteins: { value: 10, unit: "g" },
              fiber: { value: 9.5, unit: "g" },
            },
          },
        },
      },
      ["fr"],
    );
    assert.ok(slim);
    assert.deepEqual(slim.nutriments, {
      energyKcal100g: 230,
      proteins100g: 10,
      fiber100g: 9.5,
    });
  });
});

describe("buildSearchSource", () => {
  it("includes brand and localized names without duplicates", () => {
    assert.equal(
      buildSearchSource({
        brands: "Wasa",
        name: "Vitalité Kaura",
        names: extractLocalizedNames({
          product_name_fr: "Vitalité Kaura",
          product_name_en: "Vitalite Kaura",
        }),
      }),
      "Vitalité Kaura Wasa Vitalite Kaura",
    );
  });
});

describe("searchTokens", () => {
  it("splits a branded query and drops single-character tokens", () => {
    assert.equal(MIN_SEARCH_TOKEN_LENGTH, 2);
    assert.deepEqual(searchTokens("  Wasa Vitalité Kaura  "), ["Wasa", "Vitalité", "Kaura"]);
    assert.deepEqual(searchTokens("wasa vitalite kaura"), ["wasa", "vitalite", "kaura"]);
    assert.deepEqual(searchTokens("a bb"), ["bb"]);
    assert.deepEqual(searchTokens("Kaura Wasa Vitalité"), ["Kaura", "Wasa", "Vitalité"]);
    assert.equal(fuzzyTokenFilters(searchTokens("Wasa Vitalité Kaura")).length, 3);
  });
});

describe("dedupeByBarcode", () => {
  it("keeps one row per barcode and prefers the later lastModifiedAt", () => {
    const older = {
      allergens: null,
      barcode: "3017624010701",
      brands: "Ferrero",
      countryCodes: ["fr"],
      imageUrl: null,
      ingredients: null,
      lastModifiedAt: new Date("2024-01-01T00:00:00Z"),
      name: "Nutella old",
      names: {},
      novaGroup: null,
      nutriments: {},
      nutriscoreGrade: null,
      quantity: null,
      searchSource: "Nutella old Ferrero",
      servingSize: null,
    };
    const newer = { ...older, name: "Nutella", lastModifiedAt: new Date("2025-01-01T00:00:00Z") };
    const other = { ...older, barcode: "3274080005003", name: "Eau" };
    const unique = dedupeByBarcode([older, other, newer, other]);
    assert.deepEqual(
      unique.map((row) => row.barcode),
      ["3017624010701", "3274080005003"],
    );
    assert.equal(unique[0]?.name, "Nutella");
  });
});

describe("deltaFilesToApply", () => {
  it("applies later files in alphabetical order", () => {
    const index = ["b.json.gz", "a.json.gz", "c.json.gz"];
    assert.deepEqual(deltaFilesToApply(index, null), ["a.json.gz", "b.json.gz", "c.json.gz"]);
    assert.deepEqual(deltaFilesToApply(index, "a.json.gz"), ["b.json.gz", "c.json.gz"]);
    assert.deepEqual(deltaFilesToApply(index, "c.json.gz"), []);
  });
});

describe("import progress helpers", () => {
  it("formats sizes, durations, and database hosts", () => {
    assert.equal(formatBytes(500), "500 B");
    assert.equal(formatBytes(1024), "1.0 KB");
    assert.equal(formatBytes(1024 ** 3), "1.00 GB");
    assert.equal(formatDuration(1500), "1s");
    assert.equal(formatDuration(125_000), "2m 5s");
    assert.equal(databaseHost("postgres://user:pass@db.prisma.io:5432/postgres"), "db.prisma.io:5432");
  });
});
