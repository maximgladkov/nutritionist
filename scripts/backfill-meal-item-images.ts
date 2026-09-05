import { backfillMealItemImages } from "../lib/backfill-meal-item-images.ts";
import { getProductByBarcode } from "../lib/open-food-facts.ts";
import { prisma } from "../lib/prisma.ts";

const result = await backfillMealItemImages({
  lookup: async (barcode) => {
    const lookedUp = await getProductByBarcode(barcode);
    if (!lookedUp.found) {
      return { found: false };
    }
    return { found: true, imageUrl: lookedUp.product.imageUrl };
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
