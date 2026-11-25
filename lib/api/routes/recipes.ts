import { z } from "zod";
import { composeRecipe, createRecipe, deleteRecipe, getRecipe, listRecipes, logRecipe, type RecipeView } from "../../recipes.ts";
import { userCountry } from "../foods.ts";
import { notFound } from "../errors.ts";
import { noContent, readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { mealItemInputSchema, mealLabelSchema, ymdSchema } from "../schemas.ts";
import { mealWithPhotos } from "../views.ts";
import { assertNotFuture, toMealItemInputs } from "./meals.ts";

const createSchema = z.object({
  description: z.string().trim().max(300).nullable().optional(),
  items: z.array(mealItemInputSchema).min(1).max(30),
  minutes: z.number().int().positive().max(1_440).nullable().optional(),
  name: z.string().trim().min(1, "Name the recipe.").max(80),
  servings: z.number().int().min(1).max(20),
  steps: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
});

async function requireRecipe(userId: string, id: string | undefined): Promise<RecipeView> {
  const recipe = await getRecipe(userId, id ?? "");
  if (!recipe) {
    throw notFound("Recipe not found.");
  }
  return recipe;
}

export const recipeRoutes: RouteDefinition[] = [
  {
    handler: async ({ user }) => ({ recipes: await listRecipes(user.id) }),
    method: "GET",
    path: "/recipes",
  },
  {
    async handler({ request, user }) {
      const { items, ...body } = await readJson(request, createSchema);
      const content = await composeRecipe({ ...body, country: await userCountry(user.id), items: await toMealItemInputs(items) });
      return { recipe: await createRecipe(user.id, content) };
    },
    method: "POST",
    path: "/recipes",
  },
  {
    handler: async ({ params, user }) => ({ recipe: await requireRecipe(user.id, params.id) }),
    method: "GET",
    path: "/recipes/:id",
  },
  {
    async handler({ params, user }) {
      if (!(await deleteRecipe(user.id, params.id ?? ""))) {
        throw notFound("Recipe not found.");
      }
      return noContent();
    },
    method: "DELETE",
    path: "/recipes/:id",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(
        request,
        z.object({ date: ymdSchema.optional(), label: mealLabelSchema, servings: z.number().positive().max(50).default(1) }),
      );
      await assertNotFuture(user.id, body.date);
      const recipe = await requireRecipe(user.id, params.id);
      return { meal: await mealWithPhotos(await logRecipe({ ...body, recipe, userId: user.id })) };
    },
    method: "POST",
    path: "/recipes/:id/log",
  },
];
