import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchCatalogAndOpenFoodFactsMany } from "../../lib/catalog-product";
import { resolveLookupCountry } from "../lib/resolve-country";

export default defineTool({
  description:
    "Search packaged foods by name in the custom catalog and Open Food Facts. Pass every candidate name in `queries` in one call (up to 6). Custom catalog matches take precedence when they include nutrition. Uses the user's saved country unless country is passed. Pass country only to override for a product from another country. After one miss, read the label or ask, then save_product. Omit barcode on save_product unless you can clearly read one; never invent a barcode. Do not retry with slight spelling variants across extra steps. Do not call this as the user types.",
  inputSchema: z.object({
    queries: z.array(z.string().min(1)).min(1).max(6),
    country: z.string().length(2).optional(),
  }),
  async execute({ queries, country }, ctx) {
    const resolvedCountry = await resolveLookupCountry(country, ctx);
    return searchCatalogAndOpenFoodFactsMany(queries, {
      country: resolvedCountry,
      signal: ctx.abortSignal,
    });
  },
});
