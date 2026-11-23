import { z } from "zod";
import { saveCatalogProduct } from "../../catalog-product.ts";
import type { MealLabel } from "../../../generated/prisma/client.ts";
import { productKey, PRODUCT_SEGMENTS } from "../../user-products.ts";
import { listUserProducts, setProductFavorite } from "../../user-products-store.ts";
import { prisma } from "../../prisma.ts";
import { formatDateInTimeZone, localInclusiveDateRange, parseYmd, shiftYmd } from "../../timezone.ts";
import { readSummaryContext } from "../../summary.ts";
import { sumNutrients, type NutrientValues } from "../../nutrition.ts";
import { ApiError, invalid } from "../errors.ts";
import { noContent, readJson, readQuery } from "../http.ts";
import type { RouteDefinition } from "../router.ts";
import { findFoodByBarcode, getFood, searchFoodsHybrid, toFoodDetail, userCountry } from "../foods.ts";
import { nutrimentsInputSchema } from "../schemas.ts";
import { requireOwnedAttachments } from "./uploads.ts";

const MEAL_LABEL = z.enum(["breakfast", "lunch", "dinner", "snack", "other"]);
const OFTEN_LOOKBACK_DAYS = 60;
const OFTEN_LIMIT = 8;

const saveFoodSchema = z.object({
  barcode: z.string().trim().min(1).optional(),
  brand: z.string().trim().max(200).optional(),
  name: z.string().trim().min(1).max(200),
  nutrimentsPer100g: nutrimentsInputSchema,
  photos: z
    .array(z.object({ kind: z.enum(["front", "nutrition", "other"]), uploadId: z.string().min(1) }))
    .max(6)
    .optional(),
  quantity: z.string().trim().max(100).optional(),
  servingSize: z.string().trim().max(100).optional(),
});

// Adds the brand and per-100 nutrition from the newest diary entry of each product, so a
// client can show and log it without another lookup.
async function withLoggedNutrition<T extends { barcode: string | null; key: string; name: string }>(userId: string, products: readonly T[]) {
  if (products.length === 0) {
    return [];
  }
  const items = await prisma.mealItem.findMany({
    orderBy: { createdAt: "desc" },
    select: { barcode: true, brand: true, name: true, nutrimentsPer100g: true },
    where: {
      meal: { userId },
      OR: [
        { barcode: { in: products.flatMap((product) => (product.barcode ? [product.barcode] : [])) } },
        { name: { in: products.map((product) => product.name) } },
      ],
    },
  });
  const latest = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    const key = productKey(item.barcode, item.name);
    if (!latest.has(key)) {
      latest.set(key, item);
    }
  }
  return products.map((product) => {
    const logged = latest.get(product.key);
    return { ...product, brand: logged?.brand ?? null, nutrimentsPer100g: logged?.nutrimentsPer100g ?? {} };
  });
}

async function logSuggestions(userId: string, date: string, label: MealLabel) {
  const ctx = await readSummaryContext(userId);
  const yesterday = shiftYmd(date, -1);
  const range = localInclusiveDateRange(ctx.timezone, yesterday, yesterday, 1);
  const previous = await prisma.meal.findFirst({
    include: { items: { orderBy: { createdAt: "asc" } } },
    orderBy: { eatenAt: "desc" },
    where: { eatenAt: { gte: range.from, lt: range.to }, label, userId },
  });
  const repeat =
    previous && previous.items.length > 0
      ? {
          date: yesterday,
          itemCount: previous.items.length,
          items: previous.items.map((item) => ({
            amount: item.amount,
            barcode: item.barcode,
            brand: item.brand,
            name: item.name,
            nutrimentsPer100g: item.nutrimentsPer100g,
            unit: item.unit,
          })),
          label,
          mealId: previous.id,
          totals: sumNutrients(
            previous.items.map(
              (item): NutrientValues => ({
                carbohydrates: item.carbohydrates,
                energyKcal: item.energyKcal,
                fat: item.fat,
                fiber: item.fiber,
                proteins: item.proteins,
                salt: item.salt,
                saturatedFat: item.saturatedFat,
                sugars: item.sugars,
              }),
            ),
          ),
        }
      : null;

  const since = localInclusiveDateRange(ctx.timezone, shiftYmd(date, -OFTEN_LOOKBACK_DAYS), date, OFTEN_LOOKBACK_DAYS + 1);
  const items = await prisma.mealItem.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      amount: true,
      barcode: true,
      brand: true,
      createdAt: true,
      energyKcal: true,
      imageUrl: true,
      meal: { select: { eatenAt: true } },
      name: true,
      nutrimentsPer100g: true,
      unit: true,
    },
    where: { meal: { eatenAt: { gte: since.from, lt: since.to }, label, userId } },
  });
  const grouped = new Map<string, { count: number; latest: (typeof items)[number] }>();
  for (const item of items) {
    const key = productKey(item.barcode, item.name);
    const entry = grouped.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      grouped.set(key, { count: 1, latest: item });
    }
  }
  const often = [...grouped.entries()]
    .sort((a, b) => b[1].count - a[1].count || b[1].latest.createdAt.getTime() - a[1].latest.createdAt.getTime())
    .slice(0, OFTEN_LIMIT)
    .map(([key, { count, latest }]) => ({
      amount: latest.amount,
      barcode: latest.barcode,
      brand: latest.brand,
      energyKcal: latest.energyKcal === null ? null : Math.round(latest.energyKcal),
      imageUrl: latest.imageUrl,
      key,
      lastLoggedOn: formatDateInTimeZone(latest.meal.eatenAt, ctx.timezone),
      name: latest.name,
      nutrimentsPer100g: latest.nutrimentsPer100g,
      timesLogged: count,
      unit: latest.unit,
    }));
  return { date, label, often, repeat };
}

export const foodRoutes: RouteDefinition[] = [
  {
    async handler({ url, user }) {
      const query = readQuery(
        url,
        z.object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          q: z.string().trim().min(2, "Type at least two letters.").max(100),
        }),
      );
      return { foods: await searchFoodsHybrid(query.q, await userCountry(user.id), query.limit), query: query.q };
    },
    method: "GET",
    path: "/foods/search",
  },
  {
    async handler({ params, user }) {
      const food = await findFoodByBarcode(params.code ?? "", await userCountry(user.id));
      if (!food) {
        throw new ApiError(404, "food_not_found", "We don't know this barcode yet. Scan the nutrition label to add it.");
      }
      return food;
    },
    method: "GET",
    path: "/foods/barcode/:code",
  },
  {
    async handler({ params, user }) {
      return getFood(params.id ?? "", await userCountry(user.id));
    },
    method: "GET",
    path: "/foods/:id",
  },
  {
    async handler({ request, user }) {
      const body = await readJson(request, saveFoodSchema);
      const attachments = body.photos ? await requireOwnedAttachments(user.id, body.photos.map((photo) => photo.uploadId)) : [];
      const result = await saveCatalogProduct({
        barcode: body.barcode,
        brands: body.brand,
        createdByUserId: user.id,
        name: body.name,
        nutriments: body.nutrimentsPer100g,
        quantity: body.quantity,
        servingSize: body.servingSize,
      });
      if (result.status === "invalid") {
        throw invalid(result.error);
      }
      const productId = result.product.id;
      if (productId && body.photos && attachments.length > 0) {
        const existing = await prisma.catalogProductImage.count({ where: { productId } });
        await prisma.catalogProductImage.createMany({
          data: body.photos.map((photo, index) => ({
            attachmentId: photo.uploadId,
            kind: photo.kind,
            productId,
            sortOrder: existing + index,
          })),
          skipDuplicates: true,
        });
      }
      const food = productId ? await getFood(`catalog:${productId}`) : toFoodDetail(result.product, result.source);
      return { food, status: result.status, warning: result.warning ?? null };
    },
    method: "POST",
    path: "/foods",
  },
  {
    async handler({ url, user }) {
      const query = readQuery(url, z.object({ segment: z.enum(PRODUCT_SEGMENTS).default("recent") }));
      const products = await listUserProducts({ segment: query.segment, userId: user.id });
      return { products: await withLoggedNutrition(user.id, products), segment: query.segment };
    },
    method: "GET",
    path: "/products",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(request, z.object({ barcode: z.string().trim().nullable().optional(), name: z.string().trim().min(1) }));
      return setProductFavorite({ barcode: body.barcode, favorite: true, key: params.key ?? "", name: body.name, userId: user.id });
    },
    method: "PUT",
    path: "/products/favorites/:key",
  },
  {
    async handler({ params, user }) {
      await prisma.productFavorite.deleteMany({ where: { key: params.key ?? "", userId: user.id } });
      return noContent();
    },
    method: "DELETE",
    path: "/products/favorites/:key",
  },
  {
    async handler({ url, user }) {
      const ctx = await readSummaryContext(user.id);
      const query = readQuery(
        url,
        z.object({
          date: z.string().refine((value) => parseYmd(value) !== null, "Use a YYYY-MM-DD date.").optional(),
          label: MEAL_LABEL,
        }),
      );
      return logSuggestions(user.id, query.date ?? ctx.today, query.label);
    },
    method: "GET",
    path: "/log/suggestions",
  },
];
