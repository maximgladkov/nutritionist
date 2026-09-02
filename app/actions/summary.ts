"use server";

import { auth } from "@/auth";
import { resolveChannelUser } from "@/lib/identity";
import {
  loadNutritionDay,
  loadNutritionDays,
  loadNutritionDiary,
  type NutritionDayPayload,
  type NutritionDaysPayload,
  type NutritionDiaryPayload,
} from "@/lib/summary";
import { parseYmd } from "@/lib/timezone";
import { TelegramWebAppError, verifyTelegramWebAppInitData } from "@/lib/telegram-webapp";

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
  try {
    const data = await loadNutritionDiary({ userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : "Could not load that summary.";
    return { error: message, ok: false, reason: "invalid" };
  }
}

export async function getNutritionDayAction(input: {
  date: string;
  initData?: string;
}): Promise<NutritionDayResult> {
  if (!parseYmd(input.date)) {
    return { error: "Choose a valid date.", ok: false, reason: "invalid" };
  }
  const user = await resolveSummaryUser(input.initData);
  if (!user.ok) {
    return user;
  }
  try {
    const data = await loadNutritionDay({ date: input.date, userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : "Could not load that day.";
    return { error: message, ok: false, reason: "invalid" };
  }
}

export async function getNutritionDaysAction(input: {
  from: string;
  initData?: string;
  to: string;
}): Promise<NutritionDaysResult> {
  if (!parseYmd(input.from) || !parseYmd(input.to)) {
    return { error: "Choose a valid date range.", ok: false, reason: "invalid" };
  }
  const user = await resolveSummaryUser(input.initData);
  if (!user.ok) {
    return user;
  }
  try {
    const data = await loadNutritionDays({ from: input.from, to: input.to, userId: user.userId });
    return { data, ok: true };
  } catch (error) {
    const message = error instanceof RangeError ? error.message : "Could not load those days.";
    return { error: message, ok: false, reason: "invalid" };
  }
}

async function resolveSummaryUser(
  initData: string | undefined,
): Promise<
  { ok: true; userId: string } | { ok: false; error: string; reason: "unauthenticated" | "telegram" }
> {
  if (initData !== undefined && initData !== "") {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return { error: "Telegram is not configured.", ok: false, reason: "telegram" };
    }
    try {
      const telegramUser = verifyTelegramWebAppInitData(initData, botToken);
      const user = await resolveChannelUser({
        name: [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(" ") || telegramUser.username,
        provider: "telegram",
        providerUserId: String(telegramUser.id),
      });
      return { ok: true, userId: user.id };
    } catch (error) {
      if (error instanceof TelegramWebAppError && error.code === "expired") {
        return { error: error.message, ok: false, reason: "telegram" };
      }
      return { error: "Open this from the Telegram bot.", ok: false, reason: "telegram" };
    }
  }
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Sign in to view your summary.", ok: false, reason: "unauthenticated" };
  }
  return { ok: true, userId: session.user.id };
}
