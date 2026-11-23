import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { upsertMealItems } from "../../meals.ts";
import { computeItemNutrition, sumNutrients, type NutrientValues } from "../../nutrition.ts";
import type { ProductNutriments } from "../../open-food-facts.ts";
import { prisma } from "../../prisma.ts";
import { invalid, notFound } from "../errors.ts";
import { readJson } from "../http.ts";
import { API_PREFIX, type RouteDefinition } from "../router.ts";
import { mealLabelSchema, ymdSchema } from "../schemas.ts";
import { mealWithPhotos } from "../views.ts";
import { userCountry } from "../foods.ts";
import { assertNotFuture } from "./meals.ts";

// Sharing a meal: the sharer gets a link to send to anyone; the person who opens it sees the foods
// and can add them to one of their own meals. The link carries a copy of the foods as they were, so
// later edits to the original meal don't change what was sent.

// Where the app opens a share; the page behind the link sends people here.
const APP_LINK = "heroui-native-app://shared-meal";

type SharedItem = {
  amount: number;
  barcode: string | null;
  brand: string | null;
  name: string;
  nutrimentsPer100g: ProductNutriments;
  // The serving the sharer picked, if any, so the person adding it can use it too.
  serving?: { grams: number; label: string } | null;
  unit: "g" | "ml" | "serving";
};

const LABEL_NAMES: Record<string, string> = {
  breakfast: "Breakfast",
  dinner: "Dinner",
  lunch: "Lunch",
  other: "Meal",
  snack: "Snack",
};

function nutrimentsOf(value: unknown): ProductNutriments {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ProductNutriments) : {};
}

function sharedItems(value: Prisma.JsonValue): SharedItem[] {
  return Array.isArray(value) ? (value as unknown as SharedItem[]) : [];
}

function itemMetrics(item: SharedItem): NutrientValues | null {
  try {
    return computeItemNutrition({ amount: item.amount, nutriments: item.nutrimentsPer100g, unit: item.unit }).metrics;
  } catch {
    return null;
  }
}

function newToken(): string {
  return randomBytes(16).toString("base64url");
}

function shareUrl(origin: string, token: string): string {
  const base = (process.env.PUBLIC_API_ORIGIN?.trim() || origin).replace(/\/$/, "");
  return `${base}${API_PREFIX}/shared/${token}`;
}

async function requireShare(token: string) {
  const share = await prisma.mealShare.findUnique({ include: { user: { select: { name: true } } }, where: { token } });
  if (!share) {
    throw notFound("This shared meal isn't available.");
  }
  return share;
}

type ShareRow = Awaited<ReturnType<typeof requireShare>>;

function toShareView(share: ShareRow) {
  const items = sharedItems(share.items).map((item, index) => ({
    amount: item.amount,
    barcode: item.barcode,
    brand: item.brand,
    id: `${share.token}-${index}`,
    metrics: itemMetrics(item),
    name: item.name,
    nutrimentsPer100g: item.nutrimentsPer100g,
    serving: item.serving ?? null,
    unit: item.unit,
  }));
  return {
    createdAt: share.createdAt.toISOString(),
    items,
    label: share.label,
    sharedBy: share.user.name,
    token: share.token,
    totals: sumNutrients(items.flatMap((item) => (item.metrics ? [item.metrics] : []))),
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

// The page a shared link opens in a browser: what was shared, and a button into the app.
// For people who don't have the app yet: where to get it (APP_DOWNLOAD_URL, e.g. a TestFlight or
// App Store link), and to come back to this link once it's installed, since installing doesn't
// carry the meal over. Without a link set, only the advice shows.
function getTheApp(): string {
  const download = safeHttpUrl(process.env.APP_DOWNLOAD_URL);
  const button = download
    ? `<a href="${escapeHtml(download)}" style="display:block;border:1.5px solid #0d0d0d;color:#0d0d0d;text-decoration:none;font-weight:700;padding:14px;border-radius:14px;margin-top:12px">Get the app</a>`
    : "";
  return `<section style="margin-top:32px;padding-top:24px;border-top:1px solid #e6e0d6">
<p style="font-weight:700;margin:0">Don’t have Btr.me yet?</p>
${button}
<p style="color:#6b645a;font-size:14px;margin:12px 0 0">Install it, then open this link again to add the meal.</p>
</section>`;
}

function safeHttpUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function sharePage(share: ShareRow | null): Response {
  const view = share ? toShareView(share) : null;
  const title = view
    ? `${view.sharedBy ? `${view.sharedBy} shared` : "Shared"} ${LABEL_NAMES[view.label] ?? "a meal"}`
    : "This shared meal isn't available";
  const detail = view
    ? `${view.items.length} ${view.items.length === 1 ? "food" : "foods"} · ${Math.round(view.totals.energyKcal ?? 0)} kcal`
    : "It may have been removed.";
  const list = view ? view.items.map((item) => `<li>${escapeHtml(item.name)}</li>`).join("") : "";
  const open = share ? `${APP_LINK}/${encodeURIComponent(share.token)}` : null;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<body style="margin:0;background:#f7f5f1;color:#0d0d0d;font-family:-apple-system,system-ui,sans-serif">
<main style="max-width:420px;margin:0 auto;padding:48px 24px;text-align:center">
<h1 style="font-size:24px;margin:0 0 8px">${escapeHtml(title)}</h1>
<p style="color:#6b645a;margin:0 0 20px">${escapeHtml(detail)}</p>
${list ? `<ul style="list-style:none;padding:0;margin:0 0 28px;line-height:1.8">${list}</ul>` : ""}
${open ? `<a href="${open}" style="display:block;background:#c6a16c;color:#0d0d0d;text-decoration:none;font-weight:700;padding:16px;border-radius:14px">Open in Btr.me</a>
<p style="color:#6b645a;font-size:14px;margin-top:16px">Opens the app so you can add these foods to your own meal.</p>
${getTheApp()}` : ""}
</main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" }, status: share ? 200 : 404 });
}

export const mealShareRoutes: RouteDefinition[] = [
  {
    async handler({ params, url, user }) {
      const meal = await prisma.meal.findFirst({
        include: { items: { orderBy: { createdAt: "asc" } } },
        where: { id: params.id, userId: user.id },
      });
      if (!meal) {
        throw notFound("Meal not found.");
      }
      if (meal.items.length === 0) {
        throw invalid("That meal has no foods to share.");
      }
      const items: SharedItem[] = meal.items.map((item) => ({
        amount: item.amount,
        barcode: item.barcode,
        brand: item.brand,
        name: item.name,
        nutrimentsPer100g: nutrimentsOf(item.nutrimentsPer100g),
        serving:
          item.servingLabel && item.servingGrams ? { grams: item.servingGrams, label: item.servingLabel } : null,
        unit: item.unit,
      }));
      const share = await prisma.mealShare.create({
        data: { items: items as unknown as Prisma.InputJsonValue, label: meal.label, token: newToken(), userId: user.id },
        include: { user: { select: { name: true } } },
      });
      return { share: { ...toShareView(share), url: shareUrl(url.origin, share.token) } };
    },
    method: "POST",
    path: "/meals/:id/share",
  },
  {
    async handler({ params }) {
      return { share: toShareView(await requireShare(params.token ?? "")) };
    },
    method: "GET",
    path: "/shared-meals/:token",
  },
  {
    async handler({ params, request, user }) {
      const body = await readJson(
        request,
        z.object({
          date: ymdSchema.optional(),
          // The foods to add and how much of each, by their place in the share; all of them, as
          // shared, when left out. Lets the person drop foods or change amounts first.
          items: z
            .array(z.object({ amount: z.number().positive().max(10_000), index: z.number().int().min(0) }))
            .min(1)
            .max(50)
            .optional(),
          label: mealLabelSchema,
        }),
      );
      await assertNotFuture(user.id, body.date);
      const share = await requireShare(params.token ?? "");
      const shared = sharedItems(share.items);
      const picked = body.items
        ? body.items.map(({ amount, index }) => {
            const item = shared[index];
            if (!item) {
              throw invalid(`There's no food ${index + 1} in this shared meal.`);
            }
            return { ...item, amount };
          })
        : shared;
      const meal = await upsertMealItems({
        country: await userCountry(user.id),
        date: body.date,
        items: picked.map((item) => ({
          amount: item.amount,
          barcode: item.barcode ?? undefined,
          brand: item.brand ?? undefined,
          name: item.name,
          // The nutrition as it was shared, so what's added matches what was shown.
          nutrimentsPer100g: item.nutrimentsPer100g,
          serving: item.serving ?? null,
          unit: item.unit,
        })),
        label: body.label,
        userId: user.id,
      });
      return { meal: await mealWithPhotos(meal) };
    },
    method: "POST",
    path: "/shared-meals/:token/log",
  },
  {
    auth: false,
    async handler({ params }) {
      const share = await prisma.mealShare.findUnique({
        include: { user: { select: { name: true } } },
        where: { token: params.token ?? "" },
      });
      return sharePage(share);
    },
    method: "GET",
    path: "/shared/:token",
  },
];
