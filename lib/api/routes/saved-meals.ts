import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { computeItemNutrition, sumNutrients, type NutrientValues } from "../../nutrition.ts";
import type { ProductNutriments } from "../../open-food-facts.ts";
import { prisma } from "../../prisma.ts";
import { upsertMealItems } from "../../meals.ts";
import { invalid, notFound } from "../errors.ts";
import { noContent, readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { mealItemInputSchema, mealLabelSchema, ymdSchema } from "../schemas.ts";
import { mealWithPhotos } from "../views.ts";
import { findFoodByBarcode, userCountry } from "../foods.ts";
import { assertNotFuture, toMealItemInputs } from "./meals.ts";

const nameSchema = z.string().trim().min(1, "Name the meal.").max(80);

type SavedMealRow = Prisma.SavedMealGetPayload<{ include: { items: true } }>;

function nutrimentsOf(value: Prisma.JsonValue): ProductNutriments {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ProductNutriments) : {};
}

function itemMetrics(item: SavedMealRow["items"][number]): NutrientValues | null {
  try {
    return computeItemNutrition({ amount: item.amount, nutriments: nutrimentsOf(item.nutrimentsPer100g), unit: item.unit }).metrics;
  } catch {
    return null;
  }
}

function toSavedMealView(row: SavedMealRow) {
  const items = row.items.map((item) => ({
    amount: item.amount,
    barcode: item.barcode,
    brand: item.brand,
    id: item.id,
    metrics: itemMetrics(item),
    name: item.name,
    nutrimentsPer100g: nutrimentsOf(item.nutrimentsPer100g),
    unit: item.unit,
  }));
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    itemCount: items.length,
    items,
    name: row.name,
    totals: sumNutrients(items.flatMap((item) => (item.metrics ? [item.metrics] : []))),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireSavedMeal(userId: string, id: string): Promise<SavedMealRow> {
  const row = await prisma.savedMeal.findFirst({
    include: { items: { orderBy: { sortOrder: "asc" } } },
    where: { id, userId },
  });
  if (!row) {
    throw notFound("Saved meal not found.");
  }
  return row;
}

const createSchema = z.union([
  z.object({ fromMealId: z.string().min(1), name: nameSchema }),
  z.object({ items: z.array(mealItemInputSchema).min(1).max(50), name: nameSchema }),
]);

async function itemsFromBody(userId: string, body: z.infer<typeof createSchema>): Promise<Prisma.SavedMealItemCreateWithoutSavedMealInput[]> {
  if ("fromMealId" in body) {
    const meal = await prisma.meal.findFirst({
      include: { items: { orderBy: { createdAt: "asc" } } },
      where: { id: body.fromMealId, userId },
    });
    if (!meal) {
      throw notFound("Meal not found.");
    }
    if (meal.items.length === 0) {
      throw invalid("That meal has no foods to save.");
    }
    return meal.items.map((item, index) => ({
      amount: item.amount,
      barcode: item.barcode,
      brand: item.brand,
      name: item.name,
      nutrimentsPer100g: (item.nutrimentsPer100g ?? {}) as Prisma.InputJsonValue,
      sortOrder: index,
      unit: item.unit,
    }));
  }
  const country = await userCountry(userId);
  const inputs = await Promise.all(
    (await toMealItemInputs(body.items)).map(async (item) => {
      if (!item.barcode || (item.name && item.nutrimentsPer100g)) {
        return item;
      }
      // Barcode-only items take their name and nutrition from the catalog.
      const food = await findFoodByBarcode(item.barcode, country);
      if (!food) {
        throw notFound(`Product not found for barcode ${item.barcode}.`);
      }
      return {
        ...item,
        barcode: food.barcode ?? item.barcode,
        brand: item.brand ?? food.brand ?? undefined,
        name: item.name ?? food.name,
        nutrimentsPer100g: item.nutrimentsPer100g ?? food.nutrimentsPer100g,
      };
    }),
  );
  return inputs.map((item, index) => {
    if (!item.name) {
      throw invalid("Each saved food needs a name.");
    }
    return {
      amount: item.amount,
      barcode: item.barcode ?? null,
      brand: item.brand ?? null,
      name: item.name,
      nutrimentsPer100g: (item.nutrimentsPer100g ?? {}) as Prisma.InputJsonValue,
      sortOrder: index,
      unit: item.unit,
    };
  });
}

export const savedMealRoutes: RouteDefinition[] = [
  {
    async handler({ user }) {
      const rows = await prisma.savedMeal.findMany({
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { updatedAt: "desc" },
        where: { userId: user.id },
      });
      return { savedMeals: rows.map(toSavedMealView) };
    },
    method: "GET",
    path: "/saved-meals",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(request, createSchema);
      const items = await itemsFromBody(user.id, body);
      const row = await prisma.savedMeal.create({
        data: { items: { create: items }, name: body.name, userId: user.id },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
      return { savedMeal: toSavedMealView(row) };
    },
    method: "POST",
    path: "/saved-meals",
  },
  {
    async handler({ params, user }) {
      return { savedMeal: toSavedMealView(await requireSavedMeal(user.id, params.id ?? "")) };
    },
    method: "GET",
    path: "/saved-meals/:id",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(
        request,
        z
          .object({ items: z.array(mealItemInputSchema).min(1).max(50).optional(), name: nameSchema.optional() })
          .refine((value) => value.items || value.name, "Send a name or items."),
      );
      const existing = await requireSavedMeal(user.id, params.id ?? "");
      const items = body.items ? await itemsFromBody(user.id, { items: body.items, name: body.name ?? existing.name }) : null;
      const row = await prisma.$transaction(async (tx) => {
        if (items) {
          await tx.savedMealItem.deleteMany({ where: { savedMealId: existing.id } });
        }
        return tx.savedMeal.update({
          data: {
            ...(body.name ? { name: body.name } : {}),
            ...(items ? { items: { create: items } } : {}),
          },
          include: { items: { orderBy: { sortOrder: "asc" } } },
          where: { id: existing.id },
        });
      });
      return { savedMeal: toSavedMealView(row) };
    },
    method: "PATCH",
    path: "/saved-meals/:id",
  },
  {
    async handler({ params, user }) {
      const result = await prisma.savedMeal.deleteMany({ where: { id: params.id, userId: user.id } });
      if (result.count === 0) {
        throw notFound("Saved meal not found.");
      }
      return noContent();
    },
    method: "DELETE",
    path: "/saved-meals/:id",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(request, z.object({ date: ymdSchema.optional(), label: mealLabelSchema }));
      await assertNotFuture(user.id, body.date);
      const saved = await requireSavedMeal(user.id, params.id ?? "");
      const meal = await upsertMealItems({
        country: await userCountry(user.id),
        date: body.date,
        items: saved.items.map((item) => ({
          amount: item.amount,
          brand: item.brand ?? undefined,
          name: item.name,
          // Logging from stored nutrition keeps the saved meal stable even if the catalog changes.
          nutrimentsPer100g: nutrimentsOf(item.nutrimentsPer100g),
          unit: item.unit,
        })),
        label: body.label,
        userId: user.id,
      });
      return { meal: await mealWithPhotos(meal) };
    },
    method: "POST",
    path: "/saved-meals/:id/log",
  },
];
