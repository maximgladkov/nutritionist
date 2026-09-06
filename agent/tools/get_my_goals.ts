import { defineTool } from "eve/tools";
import { z } from "zod";
import { getGoals } from "../../lib/goals";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Get the caller's structured daily goals. caloriesPerDay is kcal per day; proteinGPerDay, carbsGPerDay, fatGPerDay, and fiberGPerDay are grams per day. Each field is null if unset. Prefer get_nutrition_summary when you also need today's intake or remaining, because it returns goals and remaining together. Do not invent a goal, TDEE, or maintenance number when a field is null.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const { userId } = await requireUser(ctx);
    return getGoals(userId);
  },
});
