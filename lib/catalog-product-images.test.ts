import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  primaryCatalogImageUrl,
  resolveTurnPhotoLinks,
  toCatalogImageViews,
  withCatalogImages,
} from "./catalog-product-images-query.ts";
import type { Product } from "./open-food-facts.ts";

function product(name = "Yogurt"): Product {
  return {
    allergens: null,
    barcode: "111",
    brands: null,
    countries: [],
    imageUrl: "https://off.example/old.jpg",
    ingredients: null,
    name,
    novaGroup: null,
    nutriments: { energyKcal100g: 10 },
    nutriscoreGrade: null,
    quantity: null,
    servingSize: null,
  };
}

describe("resolveTurnPhotoLinks", () => {
  const attachments = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("maps indexes to kinds and skips out-of-range and duplicate attachments", () => {
    assert.deepEqual(
      resolveTurnPhotoLinks(attachments, [
        { index: 0, kind: "front" },
        { index: 1, kind: "nutrition" },
        { index: 9, kind: "other" },
        { index: 0, kind: "other" },
      ]),
      [
        { attachmentId: "a", kind: "front", sortOrder: 0 },
        { attachmentId: "b", kind: "nutrition", sortOrder: 1 },
      ],
    );
  });

  it("returns nothing when photos are omitted", () => {
    assert.deepEqual(resolveTurnPhotoLinks(attachments, undefined), []);
    assert.deepEqual(resolveTurnPhotoLinks(attachments, []), []);
  });
});

describe("catalog image views", () => {
  it("builds public URLs and prefers the front image", () => {
    const images = toCatalogImageViews([
      { id: "n1", kind: "nutrition" },
      { id: "f1", kind: "front" },
    ]);
    assert.equal(images[0]?.url, "/api/catalog-images/n1");
    assert.equal(primaryCatalogImageUrl(images), "/api/catalog-images/f1");
    const withImages = withCatalogImages(product(), images);
    assert.equal(withImages.imageUrl, "/api/catalog-images/f1");
    assert.equal(withImages.images?.length, 2);
  });

  it("keeps the existing product image when there are no catalog photos", () => {
    const unchanged = withCatalogImages(product(), []);
    assert.equal(unchanged.imageUrl, "https://off.example/old.jpg");
    assert.equal(unchanged.images, undefined);
  });
});
