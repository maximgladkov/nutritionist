import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseCatalogMatch, kcalAgrees, nameMatch } from "./food-grounding.ts";

const product = (name: string, kcalPer100: number | null) => ({ kcalPer100, name, unit: "g" as const });

describe("nameMatch", () => {
  it("matches across accents, plurals and small words", () => {
    assert.equal(nameMatch("pan tostado", "Pan Tostado Integral"), 1);
    assert.equal(nameMatch("mantequilla", "Mantequilla sin sal"), 1);
    assert.equal(nameMatch("café solo", "Cafe molido natural"), 0.5);
    assert.equal(nameMatch("tostadas", "Tostada de trigo"), 1);
    assert.equal(nameMatch("butter", "Peanut cookies"), 0);
  });
});

describe("kcalAgrees", () => {
  it("allows ±25% or 40 kcal", () => {
    assert.equal(kcalAgrees(717, 740), true);
    assert.equal(kcalAgrees(717, 480), false);
    assert.equal(kcalAgrees(2, 30), true);
    assert.equal(kcalAgrees(undefined, 120), true);
  });
});

describe("chooseCatalogMatch", () => {
  it("picks the named product whose calories agree", () => {
    const result = chooseCatalogMatch({ kcalPer100: 717, name: "Butter", searchQueries: ["mantequilla", "butter"] }, [
      product("Galletas de mantequilla", 480),
      product("Mantequilla sin sal", 742),
      product("Mantequilla light", 380),
    ]);
    assert.equal(result.match?.name, "Mantequilla sin sal");
    assert.deepEqual(result.alternatives.map((entry) => entry.name), ["Galletas de mantequilla", "Mantequilla light"]);
  });

  it("keeps the estimate when nothing both matches and agrees", () => {
    const result = chooseCatalogMatch({ kcalPer100: 196, name: "Fried egg", searchQueries: ["huevo frito"] }, [
      product("Huevos camperos", 143),
      product("Patatas fritas", 540),
    ]);
    assert.equal(result.match, null);
    assert.equal(result.alternatives[0]?.name, "Huevos camperos");
  });

  it("skips products without nutrition", () => {
    const result = chooseCatalogMatch({ name: "Banana", searchQueries: ["plátano"] }, [product("Plátano de Canarias", null), product("Plátano", 89)]);
    assert.equal(result.match?.name, "Plátano");
  });
});
