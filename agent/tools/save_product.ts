import { defineTool } from "eve/tools";
import { z } from "zod";
import { saveCatalogProduct } from "../../lib/catalog-product";
import { nutrimentsInputSchema } from "../lib/meal-item-schema";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Save a packaged food that the product catalog does not have, using the barcode plus name and nutrition from a label photo or the user. Nutrition must be per 100g or 100ml. Other users can look it up later. Call lookup_product first; do not save if it was already found.",
  inputSchema: z.object({
    barcode: z.string().min(1),
    name: z.string().min(1),
    brands: z.string().optional(),
    quantity: z.string().optional(),
    servingSize: z.string().optional(),
    nutriments: nutrimentsInputSchema,
  }),
  async execute({ barcode, name, brands, quantity, servingSize, nutriments }, ctx) {
    const { userId } = await requireUser(ctx);
    return saveCatalogProduct({
      barcode,
      brands,
      createdByUserId: userId,
      name,
      nutriments,
      quantity,
      servingSize,
    });
  },
});
