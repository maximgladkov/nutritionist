import { defineTool } from "eve/tools";
import { z } from "zod";
import { deleteMeal } from "../../lib/meals";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description: "Delete a meal the caller owns, including its items. Use to correct a mistaken log.",
  inputSchema: z.object({
    mealId: z.string().min(1),
  }),
  async execute({ mealId }, ctx) {
    const { userId } = requireUser(ctx);
    return deleteMeal({ userId, mealId });
  },
});
