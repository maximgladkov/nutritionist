import { defineTool } from "eve/tools";
import { z } from "zod";
import { saveCalorieGoal } from "../../lib/goals";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Save or clear the caller's structured goals. Pass caloriesPerDay as a whole number of kcal per day, or null to clear it. They can also set this in Settings. Never pass another person's id.",
  inputSchema: z.object({
    caloriesPerDay: z.union([z.number(), z.null()]),
  }),
  async execute({ caloriesPerDay }, ctx) {
    const { userId } = await requireUser(ctx);
    return saveCalorieGoal(userId, caloriesPerDay);
  },
});
