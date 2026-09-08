import { defineTool } from "eve/tools";
import { z } from "zod";
import { toListMealsDayPayload } from "../../lib/list-meals-day";
import { callerTimezone, listMeals, mealQueryRange } from "../../lib/meals";
import { isSingleDayQuery, loadNutritionSummary } from "../../lib/nutrition-progress";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Required when stating what the caller ate. Do not reconstruct meals from chat. Lists meals for nutrition dates in a range, grouped into breakfast, lunch, dinner, and snack. Omit from and to to use today's nutrition day (04:00 to 04:00 the next morning in the saved timezone). from and to are inclusive YYYY-MM-DD nutrition dates. If only one is passed, that single day is used. If they are reversed, they are swapped. For this week or last week, copy the Monday-to-Sunday dates from context. Do not pass a meal type; the payload includes currentLabel from the local clock. For a single day it also returns goals, current, and remaining. Do not use those numbers from chat. To log the same meal again, call copy_meal; do not rebuild items from this list.",
  inputSchema: z.object({
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
  }),
  async execute({ from, to }, ctx) {
    const { userId } = await requireUser(ctx);
    const timezone = (await callerTimezone(userId)) ?? "UTC";
    const range = mealQueryRange({ from, to, timeZone: timezone });
    const listed = await listMeals({
      userId,
      from: range.from,
      to: range.to,
    });
    const payload = toListMealsDayPayload({
      from: listed.from,
      meals: listed.meals,
      now: new Date(),
      timeZone: timezone,
      to: listed.to,
    });
    if (!isSingleDayQuery(from, to)) {
      return payload;
    }
    const progress = await loadNutritionSummary({ from, to, userId });
    return {
      ...payload,
      current: progress.current,
      goals: progress.goals,
      remaining: progress.remaining,
    };
  },
});
