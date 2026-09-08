import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadNutritionSummary } from "../../lib/nutrition-progress";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Required before stating the caller's intake, remaining budget, or progress vs goals. Do not use chat history for those numbers. Returns goals, current (eaten so far), and remaining (goal minus current) for a single day. Omit from and to for today's nutrition day (04:00 to 04:00 the next morning in the saved timezone). from and to are inclusive YYYY-MM-DD nutrition dates. If only one is passed, that single day is used. If they are reversed, they are swapped. For this week or last week, copy the Monday-to-Sunday dates from context. Pass groupBy day for a per-day breakdown. Day buckets use the saved timezone unless timezone is passed. If a goal is null, it is unset; do not invent TDEE or maintenance calories.",
  inputSchema: z.object({
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    groupBy: z.enum(["day"]).optional(),
    timezone: z.string().min(1).optional(),
  }),
  async execute({ from, to, groupBy, timezone }, ctx) {
    const { userId } = await requireUser(ctx);
    return loadNutritionSummary({ from, groupBy, timezone, to, userId });
  },
});
