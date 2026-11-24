import { defineTool } from "eve/tools";
import { z } from "zod";
import { frequentFoods } from "../../lib/assistant/frequent-foods";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "The foods the caller logged most in the last 60 days, with their usual amount, calories, protein, and the barcode or nutrimentsPer100g to pass to suggest_meal or log_meal. Use before suggesting what to eat.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
  async execute({ limit }, ctx) {
    const { userId } = await requireUser(ctx);
    return { foods: await frequentFoods({ limit: limit ?? 12, now: new Date(), userId }) };
  },
});
