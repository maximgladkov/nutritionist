import { defineTool } from "eve/tools";
import { z } from "zod";
import { showFoods } from "../../lib/assistant/displays";
import { isAppCaller } from "../lib/app-card";
import { resolveLookupCountry } from "../lib/resolve-country";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Show foods in the app for the caller to look at: they can open each one's details, star it, or add it later. Nothing is logged. Use for questions about a food, comparisons, and what to buy or try. Use suggest_meal instead when they want something to eat now. Pass ids from find_foods, and amount in g or ml when it matters. Only works in the app.",
  inputSchema: z.object({
    foods: z.array(z.object({ amount: z.number().positive().max(10_000).optional(), id: z.string().min(1) })).min(1).max(6),
  }),
  async execute({ foods }, ctx) {
    const { userId } = await requireUser(ctx);
    if (!isAppCaller(ctx.session)) {
      return { error: "Describe them in words instead: foods only show in the app." };
    }
    const country = await resolveLookupCountry(undefined, ctx);
    return showFoods({ callId: ctx.callId, country, foods, sessionId: ctx.session.id, userId });
  },
});
