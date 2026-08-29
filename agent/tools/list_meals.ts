import { defineTool } from "eve/tools";
import { z } from "zod";
import { listMeals, parseIsoDate } from "../../lib/meals";
import { mealLabelSchema } from "../lib/meal-item-schema";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "List the caller's meals in a date range, with items, per-item metrics, and per-meal totals. from is inclusive, to is exclusive. Both are ISO-8601. Optionally filter by meal label.",
  inputSchema: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: mealLabelSchema.optional(),
  }),
  async execute({ from, to, label }, ctx) {
    const { userId } = await requireUser(ctx);
    return listMeals({
      userId,
      from: parseIsoDate(from, "from"),
      to: parseIsoDate(to, "to"),
      label,
    });
  },
});
