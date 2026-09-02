import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  choosePackagedFoodName,
  pickProductName,
  preferredLanguageForCountry,
} from "./open-food-facts-name.ts";

describe("preferredLanguageForCountry", () => {
  it("maps gb to en and leaves other country codes", () => {
    assert.equal(preferredLanguageForCountry("gb"), "en");
    assert.equal(preferredLanguageForCountry("ES"), "es");
    assert.equal(preferredLanguageForCountry(undefined), undefined);
  });
});

describe("pickProductName", () => {
  it("uses product_name when present", () => {
    assert.equal(pickProductName({ product_name: "Nutella", product_name_es: "Other" }), "Nutella");
  });

  it("falls back to a localized name when product_name is empty", () => {
    assert.equal(
      pickProductName({
        product_name: "",
        product_name_en: "PHILADELPHIA LIGHT",
        product_name_es: "Philadelphia Light",
      }),
      "PHILADELPHIA LIGHT",
    );
    assert.equal(
      pickProductName(
        {
          product_name: "",
          product_name_en: "PHILADELPHIA LIGHT",
          product_name_es: "Philadelphia Light",
        },
        "es",
      ),
      "Philadelphia Light",
    );
  });

  it("uses generic_name when no product names exist", () => {
    assert.equal(pickProductName({ product_name: " ", generic_name: "Smoked salmon" }), "Smoked salmon");
  });
});

describe("choosePackagedFoodName", () => {
  it("prefers a real provided name", () => {
    assert.equal(
      choosePackagedFoodName({
        barcode: "7622210103253",
        productName: "Philadelphia Light",
        providedName: "Light cream cheese",
      }),
      "Light cream cheese",
    );
  });

  it("replaces a barcode-only provided name with the product name", () => {
    assert.equal(
      choosePackagedFoodName({
        barcode: "7622210103253",
        productName: "Philadelphia Light",
        providedName: "7622210103253",
      }),
      "Philadelphia Light",
    );
  });

  it("falls back to the barcode when nothing else is available", () => {
    assert.equal(
      choosePackagedFoodName({ barcode: "2353445011529", productName: null }),
      "2353445011529",
    );
  });
});
