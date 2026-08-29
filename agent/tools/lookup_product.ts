import { defineTool } from "eve/tools";
import { z } from "zod";
import { getProductByBarcode, InvalidBarcodeError } from "../../lib/open-food-facts";
import { resolveLookupCountry } from "../lib/resolve-country";

export default defineTool({
  description:
    "Look up a packaged food in Open Food Facts by barcode. Uses the user's saved country unless country is passed. Pass country only to override for a product from another country.",
  inputSchema: z.object({
    barcode: z.string().min(1),
    country: z.string().length(2).optional(),
  }),
  async execute({ barcode, country }, ctx) {
    const resolvedCountry = await resolveLookupCountry(country, ctx);
    try {
      return await getProductByBarcode(barcode, {
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
