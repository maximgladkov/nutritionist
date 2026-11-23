import { z } from "zod";
import { findCatalogProductById } from "../../catalog-product.ts";
import { copyMeal, deleteMeal, deleteMealItem, listMeals, updateMealItem, upsertMealItems, type MealItemInput, type MealView } from "../../meals.ts";
import { prisma } from "../../prisma.ts";
import { readSummaryContext } from "../../summary.ts";
import { formatDateInTimeZone, localInclusiveDateRange } from "../../timezone.ts";
import { ApiError, invalid, notFound } from "../errors.ts";
import { noContent, readJson } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { mealItemInputSchema, mealLabelSchema, ymdSchema, type MealItemInputBody } from "../schemas.ts";
import { mealWithPhotos } from "../views.ts";
import { userCountry } from "../foods.ts";
import { requireOwnedAttachments } from "./uploads.ts";

const CATALOG_PREFIX = "catalog:";

export async function toMealItemInputs(items: readonly MealItemInputBody[]): Promise<MealItemInput[]> {
  return Promise.all(
    items.map(async (item): Promise<MealItemInput> => {
      const base: MealItemInput = {
        amount: item.amount,
        id: item.id,
        barcode: item.barcode,
        brand: item.brand,
        name: item.name,
        nutrimentsPer100g: item.nutrimentsPer100g,
        unit: item.unit,
      };
      if (!item.foodId) {
        return base;
      }
      if (!item.foodId.startsWith(CATALOG_PREFIX)) {
        return { ...base, barcode: base.barcode ?? item.foodId };
      }
      const product = await findCatalogProductById(item.foodId.slice(CATALOG_PREFIX.length));
      if (!product) {
        throw notFound(`Food ${item.foodId} is not in the catalog.`);
      }
      return {
        ...base,
        barcode: product.barcode ?? undefined,
        brand: base.brand ?? product.brands ?? undefined,
        name: base.name ?? product.name ?? undefined,
        nutrimentsPer100g: base.nutrimentsPer100g ?? product.nutriments,
      };
    }),
  );
}

export async function assertNotFuture(userId: string, date: string | undefined): Promise<void> {
  if (!date) {
    return;
  }
  const ctx = await readSummaryContext(userId);
  if (date > ctx.today) {
    throw invalid("You can't log food for a future day.");
  }
}

async function requireOwnedMeal(userId: string, mealId: string) {
  const meal = await prisma.meal.findFirst({ where: { id: mealId, userId } });
  if (!meal) {
    throw notFound("Meal not found.");
  }
  return meal;
}

async function loadMeal(userId: string, mealId: string): Promise<MealView> {
  const meal = await requireOwnedMeal(userId, mealId);
  const ctx = await readSummaryContext(userId);
  const date = formatDateInTimeZone(meal.eatenAt, ctx.timezone);
  const range = localInclusiveDateRange(ctx.timezone, date, date, 1);
  const { meals } = await listMeals({ from: range.from, to: range.to, userId });
  const found = meals.find((entry) => entry.id === mealId);
  if (!found) {
    throw notFound("Meal not found.");
  }
  return found;
}

export const mealRoutes: RouteDefinition[] = [
  {
    async handler({ request, user }) {
      const body = await readJson(
        request,
        z.object({ date: ymdSchema.optional(), items: z.array(mealItemInputSchema).min(1).max(50), label: mealLabelSchema }),
      );
      await assertNotFuture(user.id, body.date);
      // Retries of a request that already went through send the same client ids: skip those
      // items instead of logging them twice.
      const clientIds = body.items.flatMap((item) => (item.id ? [item.id] : []));
      const existing = clientIds.length
        ? await prisma.mealItem.findMany({ select: { id: true, meal: { select: { id: true, userId: true } } }, where: { id: { in: clientIds } } })
        : [];
      if (existing.some((row) => row.meal.userId !== user.id)) {
        throw new ApiError(409, "id_conflict", "That item id is already taken. Try again.");
      }
      const known = new Set(existing.map((row) => row.id));
      const fresh = body.items.filter((item) => !item.id || !known.has(item.id));
      if (fresh.length === 0 && existing[0]) {
        return { meal: await mealWithPhotos(await loadMeal(user.id, existing[0].meal.id)) };
      }
      const meal = await upsertMealItems({
        country: await userCountry(user.id),
        date: body.date,
        items: await toMealItemInputs(fresh),
        label: body.label,
        userId: user.id,
      });
      return { meal: await mealWithPhotos(meal) };
    },
    method: "POST",
    path: "/meals/items",
  },
  {
    async handler({ params, user }) {
      return { meal: await mealWithPhotos(await loadMeal(user.id, params.id ?? "")) };
    },
    method: "GET",
    path: "/meals/:id",
  },
  {
    async handler({ params, user }) {
      await deleteMeal({ mealId: params.id ?? "", userId: user.id });
      return noContent();
    },
    method: "DELETE",
    path: "/meals/:id",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(
        request,
        z
          .object({ amount: z.number().positive().max(10_000).optional(), label: mealLabelSchema.optional() })
          .refine((value) => value.amount !== undefined || value.label !== undefined, "Send an amount or a label."),
      );
      const meal = await updateMealItem({ amount: body.amount, itemId: params.id ?? "", label: body.label, userId: user.id });
      return { meal: await mealWithPhotos(meal) };
    },
    method: "PATCH",
    path: "/meal-items/:id",
  },
  {
    async handler({ params, user }) {
      const result = await deleteMealItem({ itemId: params.id ?? "", userId: user.id });
      return { mealDeleted: result.mealDeleted, mealId: result.mealId };
    },
    method: "DELETE",
    path: "/meal-items/:id",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(request, z.object({ date: ymdSchema, label: mealLabelSchema }));
      await assertNotFuture(user.id, body.date);
      const source = await requireOwnedMeal(user.id, params.id ?? "");
      const ctx = await readSummaryContext(user.id);
      const result = await copyMeal({
        asLabel: body.label,
        date: body.date,
        from: formatDateInTimeZone(source.eatenAt, ctx.timezone),
        label: source.label,
        userId: user.id,
      });
      if (!result.copied) {
        throw new ApiError(409, "not_copied", result.reason);
      }
      return { meal: await mealWithPhotos(result.meal) };
    },
    method: "POST",
    path: "/meals/:id/copy",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(request, z.object({ uploadId: z.string().min(1) }));
      const meal = await requireOwnedMeal(user.id, params.id ?? "");
      await requireOwnedAttachments(user.id, [body.uploadId]);
      await prisma.mealPhoto.upsert({
        create: { attachmentId: body.uploadId, mealId: meal.id },
        update: {},
        where: { mealId_attachmentId: { attachmentId: body.uploadId, mealId: meal.id } },
      });
      return { meal: await mealWithPhotos(await loadMeal(user.id, meal.id)) };
    },
    method: "POST",
    path: "/meals/:id/photos",
  },
  {
    async handler({ params, user }) {
      await requireOwnedMeal(user.id, params.id ?? "");
      await prisma.mealPhoto.deleteMany({ where: { id: params.photoId, mealId: params.id } });
      return noContent();
    },
    method: "DELETE",
    path: "/meals/:id/photos/:photoId",
  },
];
