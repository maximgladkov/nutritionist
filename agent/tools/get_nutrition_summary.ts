import { defineTool } from "eve/tools";
import { z } from "zod";
import { callerTimezone, mealQueryRange, summarizeNutrition } from "../../lib/meals";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Sum nutrition for the caller's meals in a date range. Omit from and to to use today's nutrition day (04:00 to 04:00 the next morning in the saved timezone). from and to are inclusive YYYY-MM-DD nutrition dates. If only one is passed, that single day is used. If they are reversed, they are swapped. Pass groupBy day for a per-day breakdown. Day buckets use the saved timezone unless timezone is passed.",
  inputSchema: z.object({
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    groupBy: z.enum(["day"]).optional(),
    timezone: z.string().min(1).optional(),
  }),
  async execute({ from, to, groupBy, timezone }, ctx) {
    const { userId } = await requireUser(ctx);
    const resolvedTimezone = await callerTimezone(userId, timezone);
    const range = mealQueryRange({
      from,
      to,
      timeZone: resolvedTimezone ?? "UTC",
    });
    return summarizeNutrition({
      userId,
      from: range.from,
      to: range.to,
      groupBy,
      timezone: resolvedTimezone,
    });
  },
});
