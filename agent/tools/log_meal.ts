import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseIsoDate, upsertMealItems } from "../../lib/meals";
import { mealItemInputSchema, mealLabelSchema } from "../lib/meal-item-schema";
import { resolveLookupCountry } from "../lib/resolve-country";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Log a meal with one or more foods. Group items eaten together. For packaged foods, look up first then pass barcode, amount, and unit (g, ml, or serving). For homemade or generic foods, pass name, amount, unit, and nutrimentsPer100g when known. eatenAt is ISO-8601 and defaults to now. Omit label so breakfast, lunch, dinner, or snack is inferred from the caller's local time when this tool runs. Pass label only when the user named the meal. Appends to the existing meal for that nutrition day and label when one exists; never pass a meal id.",
  inputSchema: z.object({
    eatenAt: z.string().optional(),
    label: mealLabelSchema.optional(),
    items: z.array(mealItemInputSchema).min(1).max(50),
    country: z.string().length(2).optional(),
  }),
  async execute({ eatenAt, label, items, country }, ctx) {
    const { userId } = await requireUser(ctx);
    const resolvedCountry = await resolveLookupCountry(country, ctx);
    return upsertMealItems({
      userId,
      eatenAt: eatenAt ? parseIsoDate(eatenAt, "eatenAt") : undefined,
      label,
      items,
      country: resolvedCountry,
      signal: ctx.abortSignal,
    });
  },
});
