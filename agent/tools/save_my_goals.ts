import { defineTool } from "eve/tools";
import { z } from "zod";
import { saveGoals } from "../../lib/goals";
import { requireUser } from "../lib/require-user";

const goalValue = z.union([z.number(), z.null()]).optional();

export default defineTool({
  description:
    "Save or clear the caller's structured daily goals. Pass a whole number to set a field, or null to clear it. Omit fields you are not changing. caloriesPerDay is kcal; proteinGPerDay, carbsGPerDay, fatGPerDay, and fiberGPerDay are grams. They can also set these in Settings. Never pass another person's id.",
  inputSchema: z.object({
    caloriesPerDay: goalValue,
    carbsGPerDay: goalValue,
    fatGPerDay: goalValue,
    fiberGPerDay: goalValue,
    proteinGPerDay: goalValue,
  }),
  async execute(patch, ctx) {
    const { userId } = await requireUser(ctx);
    return saveGoals(userId, patch);
  },
});
