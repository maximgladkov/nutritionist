import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerTimezone, listMeals, mealQueryRange } from "../../lib/meals";
import { mealLabelSchema } from "../lib/meal-item-schema";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "List the caller's meals in a date range, with items, per-item metrics, and per-meal totals. Omit from and to to use today's nutrition day (04:00 to 04:00 the next morning in the saved timezone). from is inclusive, to is exclusive, and both are ISO-8601 when passed. Optionally filter by meal label.",
  inputSchema: z
    .object({
      from: z.string().min(1).optional(),
      to: z.string().min(1).optional(),
      label: mealLabelSchema.optional(),
    })
    .refine((value) => (value.from === undefined) === (value.to === undefined), {
      message: "from and to must both be provided",
    }),
  async execute({ from, to, label }, ctx) {
    const { userId } = await requireUser(ctx);
    const timezone = (await callerTimezone(userId)) ?? "UTC";
    const range = mealQueryRange({ from, to, timeZone: timezone });
    return listMeals({
      userId,
      from: range.from,
      to: range.to,
      label,
    });
  },
});
