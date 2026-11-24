import { defineTool } from "eve/tools";
import { z } from "zod";
import { recordIdea } from "../../lib/assistant/actions";
import { mealItemInputSchema, mealLabelSchema } from "../lib/meal-item-schema";
import { isAppCaller } from "../lib/app-card";
import { resolveLookupCountry } from "../lib/resolve-country";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Suggest a meal in the mobile app without logging it. Use when the caller asks what to eat, or to swap an idea. The app shows the foods with an Add button; nothing is logged until they tap it, so never say it was logged. Same item fields as log_meal. Prefer foods from list_frequent_foods with their barcode or nutrimentsPer100g, in realistic portions, within what is left for the day. Pass label when they named the meal. Only works in the app.",
  inputSchema: z.object({
    items: z.array(mealItemInputSchema).min(1).max(12),
    label: mealLabelSchema.optional(),
  }),
  async execute({ items, label }, ctx) {
    const { userId } = await requireUser(ctx);
    if (!isAppCaller(ctx.session)) {
      return { error: "Suggest it in words instead: cards only show in the app." };
    }
    const country = await resolveLookupCountry(undefined, ctx);
    return recordIdea({
      callId: ctx.callId,
      country,
      items,
      label,
      sessionId: ctx.session.id,
      signal: ctx.abortSignal,
      userId,
    });
  },
});
