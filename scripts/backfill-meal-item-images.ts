import { backfillMealItemImages } from "../lib/backfill-meal-item-images.ts";
import { getProductByBarcode } from "../lib/open-food-facts.ts";
import { prisma } from "../lib/prisma.ts";

const LOOKUP_DELAY_MS = 1500;
const RATE_LIMIT_RETRIES = 8;

const result = await backfillMealItemImages({
  delayMs: LOOKUP_DELAY_MS,
  lookup: async (barcode) => {
    for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
      try {
        const lookedUp = await getProductByBarcode(barcode);
        if (!lookedUp.found) {
          return { found: false };
        }
        return { found: true, imageUrl: lookedUp.product.imageUrl };
      } catch (error) {
        if (!isRateLimited(error) || attempt === RATE_LIMIT_RETRIES) {
          throw error;
        }
        await sleep(5000 * (attempt + 1));
      }
    }
    return { found: false };
  },
  store: {
    async listBarcodesMissingImage() {
      const rows = await prisma.mealItem.findMany({
        distinct: ["barcode"],
        select: { barcode: true },
        where: { barcode: { not: null }, imageUrl: null },
      });
      return rows.flatMap((row) => (row.barcode ? [row.barcode] : []));
    },
    async setImageUrl(barcode, imageUrl) {
      const updated = await prisma.mealItem.updateMany({
        data: { imageUrl },
        where: { barcode, imageUrl: null },
      });
      return updated.count;
    },
  },
});

console.log(
  `Looked up ${result.lookedUp} barcode${result.lookedUp === 1 ? "" : "s"}, updated ${result.updated} meal item${result.updated === 1 ? "" : "s"}, skipped ${result.skipped}.`,
);

function isRateLimited(error: unknown): boolean {
  return error instanceof Error && error.message.includes("(429)");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
