import { defineTool } from "eve/tools";
import { z } from "zod";
import { getGoals, remainingVsGoals } from "../../lib/goals";
import { callerTimezone, mealQueryRange, summarizeNutrition } from "../../lib/meals";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Required before stating the caller's intake, remaining budget, or progress vs goals. Do not use chat history for those numbers. Sums logged meals in a date range and includes saved goals plus remaining (goal minus eaten) for a single day. Omit from and to for today's nutrition day (04:00 to 04:00 the next morning in the saved timezone). from and to are inclusive YYYY-MM-DD nutrition dates. If only one is passed, that single day is used. If they are reversed, they are swapped. Pass groupBy day for a per-day breakdown. Day buckets use the saved timezone unless timezone is passed. If a goal is null, it is unset; do not invent TDEE or maintenance calories.",
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
    const [summary, goals] = await Promise.all([
      summarizeNutrition({
        userId,
        from: range.from,
        to: range.to,
        groupBy,
        timezone: resolvedTimezone,
      }),
      getGoals(userId),
    ]);
    if (groupBy === "day" || !isSingleDayQuery(from, to)) {
      return { ...summary, goals };
    }
    return {
      ...summary,
      goals,
      remaining: remainingVsGoals(goals, summary.totals),
    };
  },
});

function isSingleDayQuery(from: string | undefined, to: string | undefined) {
  const start = from?.trim() ?? "";
  const end = to?.trim() ?? "";
  return start === "" || end === "" || start === end;
}
