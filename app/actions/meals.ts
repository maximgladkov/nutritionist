"use server";

import { t } from "@lingui/core/macro";
import { resolveAppUser } from "@/lib/app-user";
import { getRequestI18n } from "@/lib/i18n/request-locale";
import { deleteMealItem, MealError, updateMealItem, type MealView } from "@/lib/meals";

export type MealMutationResult =
  | { ok: true }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

const MEAL_LABELS = new Set<MealView["label"]>(["breakfast", "lunch", "dinner", "snack", "other"]);

export async function updateMealItemAction(input: {
  amount?: number;
  initData?: string;
  itemId: string;
  label?: MealView["label"];
}): Promise<MealMutationResult> {
  const i18n = await getRequestI18n();
  const itemId = input.itemId.trim();
  if (itemId.length === 0) {
    return { error: t(i18n)`Choose a food to update.`, ok: false, reason: "invalid" };
  }
  if (input.amount === undefined && input.label === undefined) {
    return { error: t(i18n)`Choose an amount or a meal.`, ok: false, reason: "invalid" };
  }
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) {
    return { error: t(i18n)`Choose a valid amount.`, ok: false, reason: "invalid" };
  }
  if (input.label !== undefined && !MEAL_LABELS.has(input.label)) {
    return { error: t(i18n)`Choose breakfast, lunch, dinner, or a snack.`, ok: false, reason: "invalid" };
  }
  const user = await resolveMealsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const userI18n = await getRequestI18n(user.userId);
  try {
    await updateMealItem({
      amount: input.amount,
      itemId,
      label: input.label,
      userId: user.userId,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof MealError ? error.message : t(userI18n)`Could not update that food.`;
    return { error: message, ok: false, reason: "invalid" };
  }
}

export async function deleteMealItemAction(input: {
  initData?: string;
  itemId: string;
}): Promise<MealMutationResult> {
  const i18n = await getRequestI18n();
  const itemId = input.itemId.trim();
  if (itemId.length === 0) {
    return { error: t(i18n)`Choose a food to remove.`, ok: false, reason: "invalid" };
  }
  const user = await resolveMealsUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const userI18n = await getRequestI18n(user.userId);
  try {
    await deleteMealItem({ itemId, userId: user.userId });
    return { ok: true };
  } catch (error) {
    const message = error instanceof MealError ? error.message : t(userI18n)`Could not remove that food.`;
    return { error: message, ok: false, reason: "invalid" };
  }
}

async function resolveMealsUser(
  initData: string | undefined,
): Promise<
  { ok: true; userId: string } | { ok: false; error: string; reason: "unauthenticated" | "telegram" }
> {
  const user = await resolveAppUser(initData);
  const i18n = await getRequestI18n(user.ok ? user.userId : undefined);
  if (!user.ok && user.reason === "unauthenticated") {
    return { error: t(i18n)`Sign in to edit your meals.`, ok: false, reason: "unauthenticated" };
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
