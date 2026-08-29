import { defineTool } from "eve/tools";
import { z } from "zod";
import { addMealItems } from "../../lib/meals";
import { mealItemInputSchema } from "../lib/meal-item-schema";
import { resolveLookupCountry } from "../lib/resolve-country";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Add foods to an existing meal the caller owns. Use after log_meal when the user ate more as part of the same meal. Same item fields as log_meal.",
  inputSchema: z.object({
    mealId: z.string().min(1),
    items: z.array(mealItemInputSchema).min(1).max(50),
    country: z.string().length(2).optional(),
  }),
  async execute({ mealId, items, country }, ctx) {
    const { userId } = requireUser(ctx);
    const resolvedCountry = await resolveLookupCountry(country, ctx);
    return addMealItems({
      userId,
      mealId,
      items,
      country: resolvedCountry,
      signal: ctx.abortSignal,
    });
  },
});
