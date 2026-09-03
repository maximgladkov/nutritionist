"use server";

import { t } from "@lingui/core/macro";
import { resolveAppUser } from "@/lib/app-user";
import { getRequestI18n } from "@/lib/i18n/request-locale";
import {
  loadNutritionDay,
  loadNutritionDays,
  loadNutritionDiary,
  type NutritionDayPayload,
  type NutritionDaysPayload,
  type NutritionDiaryPayload,
} from "@/lib/summary";
import { parseYmd } from "@/lib/timezone";

export type NutritionDayResult =
  | { ok: true; data: NutritionDayPayload }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

export type NutritionDaysResult =
  | { ok: true; data: NutritionDaysPayload }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

export type NutritionDiaryResult =
  | { ok: true; data: NutritionDiaryPayload }
  | { ok: false; error: string; reason: "unauthenticated" | "telegram" | "invalid" };

export async function getNutritionDiaryAction(input: {
  initData?: string;
}): Promise<NutritionDiaryResult> {
  const user = await resolveSummaryUser(input.initData);
  if (!user.ok) {
    return user;
  }
  const i18n = await getRequestI18n(user.userId);
  try {
    const data = await loadNutritionDiary({ userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : t(i18n)`Could not load that summary.`;
    return { error: message, ok: false, reason: "invalid" };
  }
}

export async function getNutritionDayAction(input: {
  date: string;
  initData?: string;
}): Promise<NutritionDayResult> {
  const i18n = await getRequestI18n();
  if (!parseYmd(input.date)) {
    return { error: t(i18n)`Choose a valid date.`, ok: false, reason: "invalid" };
  }
  const user = await resolveSummaryUser(input.initData);
  if (!user.ok) {
    return user;
  }
  try {
    const data = await loadNutritionDay({ date: input.date, userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : t(i18n)`Could not load that day.`;
    return { error: message, ok: false, reason: "invalid" };
  }
}

export async function getNutritionDaysAction(input: {
  from: string;
  initData?: string;
  to: string;
}): Promise<NutritionDaysResult> {
  const i18n = await getRequestI18n();
  if (!parseYmd(input.from) || !parseYmd(input.to)) {
    return { error: t(i18n)`Choose a valid date range.`, ok: false, reason: "invalid" };
  }
  const user = await resolveSummaryUser(input.initData);
  if (!user.ok) {
    return user;
  }
  try {
    const data = await loadNutritionDays({ from: input.from, to: input.to, userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : t(i18n)`Could not load those days.`;
    return { error: message, ok: false, reason: "invalid" };
  }
}

async function resolveSummaryUser(
  initData: string | undefined,
): Promise<
  { ok: true; userId: string } | { ok: false; error: string; reason: "unauthenticated" | "telegram" }
> {
  const user = await resolveAppUser(initData);
  const i18n = await getRequestI18n(user.ok ? user.userId : undefined);
  if (!user.ok && user.reason === "unauthenticated") {
    return { error: t(i18n)`Sign in to view your summary.`, ok: false, reason: "unauthenticated" };
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
