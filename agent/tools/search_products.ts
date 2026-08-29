import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchProductsByName } from "../../lib/open-food-facts";
import { resolveLookupCountry } from "../lib/resolve-country";

export default defineTool({
  description:
    "Search packaged foods in Open Food Facts by product name. Uses the user's saved country unless country is passed. Pass country only to override for a product from another country. Do not call this as the user types.",
  inputSchema: z.object({
    name: z.string().min(1),
    country: z.string().length(2).optional(),
  }),
  async execute({ name, country }, ctx) {
    const resolvedCountry = await resolveLookupCountry(country, ctx);
    return searchProductsByName(name, {
      country: resolvedCountry,
      signal: ctx.abortSignal,
    });
  },
});
