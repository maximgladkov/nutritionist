import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchFoodsHybrid } from "../../lib/api/foods";
import { resolveLookupCountry } from "../lib/resolve-country";

export default defineTool({
  description:
    "Find foods in the whole catalog by name or meaning, plain foods (egg, chicken breast) as well as packaged ones. Returns ids for show_foods, and nutrition per 100 g or ml. Search once per food, in the user's words.",
  inputSchema: z.object({ query: z.string().min(2).max(100) }),
  async execute({ query }, ctx) {
    const country = await resolveLookupCountry(undefined, ctx);
    const foods = await searchFoodsHybrid(query, country, 8);
    return {
      foods: foods.map(({ brand, id, kcalPer100, name, nutrimentsPer100g, unit }) => ({ brand, id, kcalPer100, name, nutrimentsPer100g, unit })),
    };
  },
});
