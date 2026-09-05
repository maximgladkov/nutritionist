import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvalidBarcodeError } from "./open-food-facts.ts";
import { backfillMealItemImages } from "./backfill-meal-item-images.ts";

describe("backfillMealItemImages", () => {
  it("updates rows when Open Food Facts has an image", async () => {
    const updated: string[] = [];
    const lookedUp: string[] = [];
    const result = await backfillMealItemImages({
      delayMs: 0,
      lookup: async (barcode) => {
        lookedUp.push(barcode);
        if (barcode === "111") {
          return { found: true, imageUrl: "https://example.com/a.jpg" };
        }
        return { found: false };
      },
      store: {
        listBarcodesMissingImage: async () => ["111", "222"],
        setImageUrl: async (barcode, imageUrl) => {
          updated.push(`${barcode}:${imageUrl}`);
          return barcode === "111" ? 3 : 0;
        },
      },
    });
    assert.deepEqual(lookedUp, ["111", "222"]);
    assert.deepEqual(updated, ["111:https://example.com/a.jpg"]);
    assert.deepEqual(result, { lookedUp: 2, skipped: 1, updated: 3 });
  });

  it("skips invalid barcodes and products without images", async () => {
    const result = await backfillMealItemImages({
      delayMs: 0,
      lookup: async (barcode) => {
        if (barcode === "bad") {
          throw new InvalidBarcodeError(barcode);
        }
        return { found: true, imageUrl: null };
      },
      store: {
        listBarcodesMissingImage: async () => ["bad", "333"],
        setImageUrl: async () => {
          throw new Error("should not update");
        },
      },
    });
    assert.deepEqual(result, { lookedUp: 2, skipped: 2, updated: 0 });
  });
});
