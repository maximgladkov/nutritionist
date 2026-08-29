import { defineTool } from "eve/tools";
import { z } from "zod";
import { getGoals } from "../../lib/goals";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description: "Get the caller's structured goals. Today caloriesPerDay is kcal per day, or null if unset.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const { userId } = await requireUser(ctx);
    return getGoals(userId);
  },
});
