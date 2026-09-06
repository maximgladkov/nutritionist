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
    assert.deepEqual(
      ranked.map((product) => product.name),
      ["Banana", "Banana", "Banana chips", "Banana parfait"],
    );
    assert.equal(ranked[0]?.hasNutrition, true);
    assert.equal(ranked[1]?.hasNutrition, false);
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
