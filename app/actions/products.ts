"use server";

import { t } from "@lingui/core/macro";
import { resolveAppUser } from "@/lib/app-user";
import { getRequestI18n } from "@/lib/i18n/request-locale";
import { addItemToTodaysMeal, MealError } from "@/lib/meals";
import type { AmountUnit } from "@/lib/nutrition";
import { prisma } from "@/lib/prisma";
import { listUserProducts, setProductFavorite } from "@/lib/user-products-store";
import {
  PRODUCT_MEAL_LABELS,
  PRODUCT_SEGMENTS,
  type ProductMealLabel,
  type ProductSegment,
  type UserProductView,
} from "@/lib/user-products";

export type UserProductsResult =
  | { ok: true; data: readonly UserProductView[] }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

export type ProductMutationResult =
  | { ok: true }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

const UNITS = new Set<AmountUnit>(["g", "ml", "serving"]);
const SEGMENTS = new Set<string>(PRODUCT_SEGMENTS);
const MEAL_LABELS = new Set<string>(PRODUCT_MEAL_LABELS);

export async function getUserProductsAction(input: {
  initData?: string;
  segment: ProductSegment;
}): Promise<UserProductsResult> {
  if (!SEGMENTS.has(input.segment)) {
    const i18n = await getRequestI18n();
    return { error: t(i18n)`Choose a valid product list.`, ok: false, reason: "invalid" };
  }
  const user = await resolveProductsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    const data = await listUserProducts({ segment: input.segment, userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    console.error("listUserProducts failed", error);
    return { error: t(i18n)`Could not load products.`, ok: false, reason: "invalid" };
  }
}

export async function toggleProductFavoriteAction(input: {
  barcode?: string | null;
  favorite: boolean;
  initData?: string;
  key: string;
  name: string;
}): Promise<ProductMutationResult> {
  const user = await resolveProductsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    await setProductFavorite({
      barcode: input.barcode,
      favorite: input.favorite,
      key: input.key,
      name: input.name,
      userId: user.userId,
    });
    return { ok: true };
  } catch {
    return { error: t(i18n)`Could not update favorites.`, ok: false, reason: "invalid" };
  }
}

export async function logProductAction(input: {
  amount: number;
  barcode?: string | null;
  initData?: string;
  label: ProductMealLabel;
  name: string;
  unit: AmountUnit;
}): Promise<ProductMutationResult> {
  const i18n = await getRequestI18n();
  if (!MEAL_LABELS.has(input.label)) {
    return { error: t(i18n)`Choose breakfast, lunch, dinner, or a snack.`, ok: false, reason: "invalid" };
  }
  if (!UNITS.has(input.unit)) {
    return { error: t(i18n)`Choose a valid amount.`, ok: false, reason: "invalid" };
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: t(i18n)`Choose a valid amount.`, ok: false, reason: "invalid" };
  }
  const name = input.name.trim();
  const barcode = input.barcode?.trim() || undefined;
  if (!barcode && name.length === 0) {
    return { error: t(i18n)`Choose a product.`, ok: false, reason: "invalid" };
  }
  const user = await resolveProductsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const userI18n = await getRequestI18n(user.userId);
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.userId },
      select: { country: true },
    });
    await addItemToTodaysMeal({
      country: profile?.country ?? undefined,
      item: {
        amount: input.amount,
        barcode,
        name: name || undefined,
        unit: input.unit,
      },
      label: input.label,
      userId: user.userId,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof MealError ? error.message : t(userI18n)`Could not add that food.`;
    return { error: message, ok: false, reason: "invalid" };
  }
}

async function resolveProductsUser(
  initData: string | undefined,
): Promise<
  { ok: true; userId: string } | { ok: false; error: string; reason: "unauthenticated" | "telegram" }
> {
  const user = await resolveAppUser(initData);
  const i18n = await getRequestI18n(user.ok ? user.userId : undefined);
  if (!user.ok && user.reason === "unauthenticated") {
    return { error: t(i18n)`Sign in to view your products.`, ok: false, reason: "unauthenticated" };
  }
  if (!user.ok) {
    if (user.error.includes("expired")) {
      return {
        error: t(i18n)`Telegram login expired. Close and open the summary again.`,
        ok: false,
        reason: "telegram",
      };
    }
    if (user.error.includes("not configured")) {
      return { error: t(i18n)`Telegram is not configured.`, ok: false, reason: "telegram" };
    }
    return { error: t(i18n)`Open this from the Telegram bot.`, ok: false, reason: "telegram" };
  }
  return user;
}
