import { defineTool } from "eve/tools";
import { z } from "zod";
import { showRecipe } from "../../lib/assistant/displays";
import { composeRecipe } from "../../lib/recipes";
import { isAppCaller } from "../lib/app-card";
import { mealItemInputSchema } from "../lib/meal-item-schema";
import { resolveLookupCountry } from "../lib/resolve-country";
import { requireUser } from "../lib/require-user";

export default defineTool({
  description:
    "Suggest a recipe in the app, with ingredients for all the servings together and short steps. The caller can save it to their recipes; nothing is saved or logged until they do, so never say it was. Give every ingredient an amount, and a barcode or nutrimentsPer100g from find_foods or list_frequent_foods when you have it. Respect foods they avoid or are allergic to. Write it in their language. Only works in the app.",
  inputSchema: z.object({
    description: z.string().max(300).optional(),
    ingredients: z.array(mealItemInputSchema).min(1).max(30),
    minutes: z.number().int().positive().max(1_440).optional(),
    name: z.string().min(1).max(80),
    servings: z.number().int().min(1).max(20),
    steps: z.array(z.string().min(1).max(500)).min(1).max(20),
  }),
  async execute({ description, ingredients, minutes, name, servings, steps }, ctx) {
    const { userId } = await requireUser(ctx);
    if (!isAppCaller(ctx.session)) {
      return { error: "Write the recipe in words instead: recipes only show in the app." };
    }
    const country = await resolveLookupCountry(undefined, ctx);
    const recipe = await composeRecipe({ country, description, items: ingredients, minutes, name, servings, signal: ctx.abortSignal, steps });
    return { display: await showRecipe({ callId: ctx.callId, recipe, sessionId: ctx.session.id, userId }) };
  },
});
