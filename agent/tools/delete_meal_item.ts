import { defineTool } from "eve/tools";
import { z } from "zod";
import { deleteMealItem } from "../../lib/meals";
import { attachTodayNutritionProgress } from "../../lib/nutrition-progress";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Delete one food item from a meal the caller owns. Use to correct a mistaken log. The meal is removed when its last item is deleted. Returns today's goals, current, and remaining after the delete. Use those fields; do not reuse leftover kcal from chat.",
  inputSchema: z.object({
    itemId: z.string().min(1),
  }),
  async execute({ itemId }, ctx) {
    const { userId } = await requireUser(ctx);
    const deleted = await deleteMealItem({ userId, itemId });
    return attachTodayNutritionProgress(userId, deleted);
  },
});
