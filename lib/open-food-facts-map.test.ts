import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapProduct } from "./open-food-facts-map.ts";

describe("mapProduct", () => {
  it("maps nutriments, countries, and prefers image_small_url", () => {
    const product = mapProduct(
      {
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
          "saturated-fat_100g": 10.6,
          "energy-kcal_100ml": 539,
          proteins_100ml: 6.3,
        },
        image_small_url: "https://example.com/nutella-small.jpg",
        image_url: "https://example.com/nutella.jpg",
        countries_tags: ["en:france"],
      },
      "3017624010701",
      "us",
    );
    assert.equal(product.name, "Nutella");
    assert.equal(product.imageUrl, "https://example.com/nutella-small.jpg");
    assert.equal(product.nutriments.energyKcal100g, 539);
    assert.equal(product.nutriments.energyKcal100ml, 539);
    assert.equal(product.nutriments.proteins100ml, 6.3);
    assert.equal(product.nutriments.saturatedFat100g, 10.6);
    assert.deepEqual(product.countries, ["fr"]);
  });

  it("falls back to a localized product name when product_name is empty", () => {
    const product = mapProduct(
      {
        code: "7622210103253",
        product_name: "",
        product_name_en: "PHILADELPHIA LIGHT",
        product_name_es: "Philadelphia Light",
      },
      undefined,
      "es",
    );
    assert.equal(product.name, "Philadelphia Light");
  });

  it("reads dump nutrition.aggregated_set when nutriments is empty", () => {
    const product = mapProduct({
      code: "4005514170498",
      product_name: "Pâté mexicana",
      nutriments: {},
      nutrition: {
        aggregated_set: {
          per: "100g",
          nutrients: {
            "energy-kcal": { value: 218, unit: "kcal" },
            proteins: { value: 3.6, unit: "g" },
            carbohydrates: { value: "10.5", unit: "g" },
            sugars: { value: 2, unit: "g" },
            fat: { value: 17, unit: "g" },
            "saturated-fat": { value: 11.3, unit: "g" },
            salt: { value: 1.9, unit: "g" },
          },
        },
      },
    });
    assert.deepEqual(product.nutriments, {
      energyKcal100g: 218,
      proteins100g: 3.6,
      carbohydrates100g: 10.5,
      sugars100g: 2,
      fat100g: 17,
      saturatedFat100g: 11.3,
      salt100g: 1.9,
    });
  });

  it("maps aggregated 100ml nutrients and converts kJ when kcal is missing", () => {
    const product = mapProduct({
      code: "3274080005003",
      product_name: "Eau",
      nutrition: {
        aggregated_set: {
          per: "100ml",
          nutrients: {
            "energy-kj": { value: 418.4, unit: "kJ" },
            proteins: { value: 0, unit: "g" },
            fibre: { value: 0.8, unit: "g" },
          },
        },
      },
    });
    assert.equal(product.nutriments.energyKcal100ml, 100);
    assert.equal(product.nutriments.proteins100ml, 0);
    assert.equal(product.nutriments.fiber100ml, 0.8);
    assert.equal(product.nutriments.energyKcal100g, undefined);
  });

  it("falls back to image_url when image_small_url is missing", () => {
    const product = mapProduct({
      code: "3017624010701",
      product_name: "Nutella",
      image_url: "https://example.com/nutella.jpg",
    });
    assert.equal(product.imageUrl, "https://example.com/nutella.jpg");
  });
});
