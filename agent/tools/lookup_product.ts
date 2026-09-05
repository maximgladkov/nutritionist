import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveProductByBarcode } from "../../lib/catalog-product";
import { InvalidBarcodeError } from "../../lib/open-food-facts";
import { resolveLookupCountry } from "../lib/resolve-country";

export default defineTool({
  description:
    "Look up a packaged food by barcode in the product catalog. Uses the user's saved country unless country is passed. Pass country only to override for a product from another country. If it is not found, read the label or ask the user, then save_product.",
  inputSchema: z.object({
    barcode: z.string().min(1),
    country: z.string().length(2).optional(),
  }),
  async execute({ barcode, country }, ctx) {
    const resolvedCountry = await resolveLookupCountry(country, ctx);
    try {
      return await resolveProductByBarcode(barcode, {
        country: resolvedCountry,
        signal: ctx.abortSignal,
      });
    } catch (error) {
      if (error instanceof InvalidBarcodeError) {
        return { found: false as const, barcode, error: error.message };
      }
      throw error;
    }
  },
});
