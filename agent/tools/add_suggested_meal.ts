import { defineTool } from "eve/tools";
import { z } from "zod";
import { addIdea } from "../../lib/assistant/actions";
import { attachTodayNutritionProgress } from "../../lib/nutrition-progress";
import { resolveLookupCountry } from "../lib/resolve-country";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Log a meal that suggest_meal suggested earlier in this conversation, after the caller clearly said yes to it in their latest message. Pass the card id suggest_meal returned. Never call it in the same turn as suggest_meal. Adding the same one twice changes nothing.",
  inputSchema: z.object({ cardId: z.string().min(1) }),
  async execute({ cardId }, ctx) {
    const { userId } = await requireUser(ctx);
    const card = await addIdea({ country: await resolveLookupCountry(undefined, ctx), id: cardId, userId });
    if (!card) {
      return { added: false, reason: "That suggestion is gone." };
    }
    return attachTodayNutritionProgress(userId, { added: true, card });
  },
});
