import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeImageUrl, productImagePreviews } from "./product-image-preview.ts";

describe("productImagePreviews", () => {
  it("collects unique named images from nested tool output", () => {
    const previews = productImagePreviews({
      found: true,
      product: { imageUrl: "https://example.com/a.jpg", name: "Nutella" },
      meals: [
        {
          items: [
            { imageUrl: "https://example.com/a.jpg", name: "Nutella" },
            { imageUrl: "https://example.com/b.jpg", name: "Oatly" },
            { name: "Apple" },
          ],
        },
      ],
    });
    assert.deepEqual(previews, [
      { imageUrl: "https://example.com/a.jpg", name: "Nutella" },
      { imageUrl: "https://example.com/b.jpg", name: "Oatly" },
    ]);
  });
});

describe("looksLikeImageUrl", () => {
  it("accepts imageUrl keys and image pathnames", () => {
    assert.equal(looksLikeImageUrl("https://images.openfoodfacts.org/x/front.jpg"), true);
    assert.equal(looksLikeImageUrl("https://example.com/file", "imageUrl"), true);
    assert.equal(looksLikeImageUrl("https://example.com/page"), false);
    assert.equal(looksLikeImageUrl("not-a-url"), false);
  });
});
