import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertMealItems } from "../../lib/meals";
import { mealItemInputSchema, mealLabelSchema } from "../lib/meal-item-schema";
import { resolveLookupCountry } from "../lib/resolve-country";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Add foods to the caller's meal for a nutrition day and meal type. Same item fields as log_meal. Pass label when the user named breakfast, lunch, dinner, or snack; omit it to use the current slot. Pass date as YYYY-MM-DD only to add to another nutrition day. Never pass a meal id. Do not call list_meals just to append.",
  inputSchema: z.object({
    items: z.array(mealItemInputSchema).min(1).max(50),
    label: mealLabelSchema.optional(),
    date: z.string().optional(),
    country: z.string().length(2).optional(),
  }),
  async execute({ items, label, date, country }, ctx) {
    const { userId } = await requireUser(ctx);
    const resolvedCountry = await resolveLookupCountry(country, ctx);
    return upsertMealItems({
      userId,
      items,
      label,
      date,
      country: resolvedCountry,
      signal: ctx.abortSignal,
    });
  },
});
