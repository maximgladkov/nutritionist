import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchCatalogAndOpenFoodFacts } from "../../lib/catalog-product";
import { resolveLookupCountry } from "../lib/resolve-country";

export default defineTool({
  description:
    "Search packaged foods by product name in the product catalog. Uses the user's saved country unless country is passed. Pass country only to override for a product from another country. Do not call this as the user types.",
  inputSchema: z.object({
    name: z.string().min(1),
    country: z.string().length(2).optional(),
  }),
  async execute({ name, country }, ctx) {
    const resolvedCountry = await resolveLookupCountry(country, ctx);
    return searchCatalogAndOpenFoodFacts(name, {
      country: resolvedCountry,
      signal: ctx.abortSignal,
    });
  },
});
