import { defineTool } from "eve/tools";
import { z } from "zod";
import { copyMeal } from "../../lib/meals";
import { attachTodayNutritionProgress } from "../../lib/nutrition-progress";
import { mealLabelSchema } from "../lib/meal-item-schema";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Copy a previously logged meal onto another nutrition day. Required when they want the same breakfast, lunch, dinner, or snack as a past day. Convert relative days to from as YYYY-MM-DD from the nutrition day in context (yesterday is the previous nutrition date). Pass label when they named the slot; omit it to use the current slot. Omit date to log it today. Pass asLabel only when they want a different slot. Copies stored items as logged; do not rebuild them from chat or list_meals, and do not call log_meal for a repeat. Returns copied false when that slot was empty. Returns the meal plus today's goals, current, and remaining when copied is true. Use those fields; do not reuse leftover kcal from chat.",
  inputSchema: z.object({
    from: z.string().min(1),
    label: mealLabelSchema.optional(),
    date: z.string().optional(),
    asLabel: mealLabelSchema.optional(),
  }),
  async execute({ from, label, date, asLabel }, ctx) {
    const { userId } = await requireUser(ctx);
    const copied = await copyMeal({
      asLabel,
      date,
      from,
      label,
      userId,
    });
    return attachTodayNutritionProgress(userId, copied);
  },
});
