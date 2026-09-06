import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadTodayNutritionProgress } from "../../lib/nutrition-progress";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Get the caller's structured daily goals together with today's current intake and remaining. caloriesPerDay is kcal per day; proteinGPerDay, carbsGPerDay, fatGPerDay, and fiberGPerDay are grams per day. Each goal field is null if unset. Prefer get_nutrition_summary when you need another date. Do not invent a goal, TDEE, or maintenance number when a field is null.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const { userId } = await requireUser(ctx);
    return loadTodayNutritionProgress(userId);
  },
});
